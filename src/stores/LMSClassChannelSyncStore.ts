/*
Copyright 2026 DGE

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { logger } from "matrix-js-sdk/src/logger";

import { ActionPayload } from "../dispatcher/payloads";
import { AsyncStoreWithClient } from "./AsyncStoreWithClient";
import defaultDispatcher from "../dispatcher/dispatcher";
import SdkConfig from "../SdkConfig";

interface IState {
    active: boolean;
    lastSyncTs: number | null;
}

interface IClassAssignment {
    classId: string;
    roomRef: string;
}

interface IKnownAssignment {
    roomRef: string;
    resolvedRoomId?: string;
}

interface IRetryTask {
    key: string;
    operation: "join" | "leave";
    classId: string;
    target: string;
}

const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_RETRY_BASE_DELAY_MS = 2_000;
const DEFAULT_RETRY_MAX_ATTEMPTS = 8;

function normalizeTarget(target: string): string {
    return target.trim().toLowerCase();
}

function extractUsernameFromMxid(userId: string): string {
    const colonIdx = userId.indexOf(":");
    return userId.slice(1, colonIdx > 0 ? colonIdx : undefined);
}

function getValueAtPath(input: unknown, path: string): unknown {
    if (!path) return undefined;
    const parts = path.split(".").filter(Boolean);

    let current = input;
    for (const part of parts) {
        if (typeof current !== "object" || current === null || !(part in current)) {
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }

    return current;
}

function pickString(input: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = input[key];
        if (typeof value === "string" && value.trim().length > 0) {
            return value.trim();
        }
    }
    return null;
}

function extractRoomRef(item: Record<string, unknown>): string | null {
    const directRef = pickString(item, [
        "room_id",
        "roomId",
        "matrix_room_id",
        "channel_room_id",
        "room_alias",
        "roomAlias",
        "matrix_room_alias",
        "channel_alias",
    ]);
    if (directRef) return directRef;

    const nestedCandidates = ["channel", "room", "communication_channel"];
    for (const candidate of nestedCandidates) {
        const nested = item[candidate];
        if (typeof nested !== "object" || nested === null) continue;
        const nestedRef = pickString(nested as Record<string, unknown>, [
            "room_id",
            "roomId",
            "matrix_room_id",
            "room_alias",
            "roomAlias",
            "matrix_room_alias",
            "channel_alias",
        ]);
        if (nestedRef) return nestedRef;
    }

    return null;
}

function buildRetryKey(operation: "join" | "leave", classId: string, target: string): string {
    return `${operation}|${classId}|${normalizeTarget(target)}`;
}

export class LMSClassChannelSyncStore extends AsyncStoreWithClient<IState> {
    private static readonly internalInstance = (() => {
        const instance = new LMSClassChannelSyncStore();
        instance.start();
        return instance;
    })();

    private pollHandle?: ReturnType<typeof setInterval>;
    private syncInFlight = false;
    private syncQueued = false;

    private readonly knownAssignments = new Map<string, IKnownAssignment>();
    private desiredAssignments = new Map<string, string>();

    private readonly retryTasks = new Map<string, IRetryTask>();
    private readonly retryAttempts = new Map<string, number>();
    private readonly retryTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

    private constructor() {
        super(defaultDispatcher, { active: false, lastSyncTs: null });
    }

    public static get instance(): LMSClassChannelSyncStore {
        return LMSClassChannelSyncStore.internalInstance;
    }

    protected async onReady(): Promise<void> {
        this.stopLoop();
        this.clearAllRetries();
        this.knownAssignments.clear();
        this.desiredAssignments = new Map();

        const syncCfg = SdkConfig.get("lms_class_channel_sync");
        if (!syncCfg?.enabled) {
            await this.updateState({ active: false, lastSyncTs: null });
            return;
        }

        await this.updateState({ active: true, lastSyncTs: null });
        this.requestSync("initial");

        const pollIntervalMs =
            typeof syncCfg.poll_interval_ms === "number" && syncCfg.poll_interval_ms > 0
                ? syncCfg.poll_interval_ms
                : DEFAULT_POLL_INTERVAL_MS;

        this.pollHandle = setInterval(() => {
            this.requestSync("poll");
        }, pollIntervalMs);

        logger.info(`[LMSClassChannelSyncStore] Started class-channel sync (interval ${pollIntervalMs}ms)`);
    }

    protected async onNotReady(): Promise<void> {
        this.stopLoop();
        this.clearAllRetries();
        this.knownAssignments.clear();
        this.desiredAssignments = new Map();
        await this.updateState({ active: false, lastSyncTs: null });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected async onAction(payload: ActionPayload): Promise<void> {
        // no-op
    }

    private stopLoop(): void {
        if (this.pollHandle) {
            clearInterval(this.pollHandle);
            this.pollHandle = undefined;
        }
    }

    private clearAllRetries(): void {
        for (const timeoutId of this.retryTimeouts.values()) {
            clearTimeout(timeoutId);
        }
        this.retryTimeouts.clear();
        this.retryAttempts.clear();
        this.retryTasks.clear();
    }

    private requestSync(reason: string): void {
        if (this.syncInFlight) {
            this.syncQueued = true;
            return;
        }

        void this.syncClassAssignments(reason);
    }

    private async syncClassAssignments(reason: string): Promise<void> {
        const client = this.matrixClient;
        if (!client) return;

        const syncCfg = SdkConfig.get("lms_class_channel_sync");
        if (!syncCfg?.enabled) return;

        this.syncInFlight = true;

        try {
            const fetchedAssignments = await this.fetchDesiredAssignments();
            this.desiredAssignments = new Map(fetchedAssignments.map((a) => [a.classId, a.roomRef]));

            await this.applyAssignmentDiff(fetchedAssignments);
            await this.updateState({ active: true, lastSyncTs: Date.now() });
            logger.debug(`[LMSClassChannelSyncStore] Sync completed (${reason}) with ${fetchedAssignments.length} classes`);
        } catch (error) {
            logger.error(`[LMSClassChannelSyncStore] Sync failed (${reason})`, error);
        } finally {
            this.syncInFlight = false;
            if (this.syncQueued) {
                this.syncQueued = false;
                this.requestSync("queued");
            }
        }
    }

    private async fetchDesiredAssignments(): Promise<IClassAssignment[]> {
        const client = this.matrixClient;
        if (!client) return [];

        const syncCfg = SdkConfig.get("lms_class_channel_sync");
        const lmsBaseUrl = SdkConfig.get("lms_base_url");

        const userId = client.getUserId();
        if (!userId) return [];

        if (!lmsBaseUrl) {
            logger.warn("[LMSClassChannelSyncStore] lms_base_url is not configured; class-channel sync skipped");
            return [];
        }

        const username = extractUsernameFromMxid(userId);
        const base = lmsBaseUrl.replace(/\/$/, "");
        const endpoint = syncCfg?.classes_endpoint?.trim() || `${base}/oauth2/getuserclasses/${encodeURIComponent(username)}`;

        const timeoutMs =
            typeof syncCfg?.request_timeout_ms === "number" && syncCfg.request_timeout_ms > 0
                ? syncCfg.request_timeout_ms
                : DEFAULT_REQUEST_TIMEOUT_MS;

        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

        let response: Response;
        try {
            response = await fetch(endpoint, {
                method: "GET",
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeoutHandle);
        }

        if (!response.ok) {
            throw new Error(`Class fetch failed with HTTP ${response.status}`);
        }

        const payload = (await response.json()) as unknown;
        const classesPath = syncCfg?.classes_path || "classes";

        const sources: unknown[] = [getValueAtPath(payload, classesPath), getValueAtPath(payload, "data.classes"), payload];
        const rawClasses = sources.find((candidate) => Array.isArray(candidate));

        if (!Array.isArray(rawClasses)) {
            logger.warn("[LMSClassChannelSyncStore] Classes payload does not contain a valid array");
            return [];
        }

        const parsedAssignments: IClassAssignment[] = [];
        for (const entry of rawClasses) {
            if (typeof entry !== "object" || entry === null) continue;

            const record = entry as Record<string, unknown>;
            const classId = pickString(record, ["id", "class_id", "course_id", "classCode", "code", "slug"]);
            const roomRef = extractRoomRef(record);
            if (!classId || !roomRef) continue;

            parsedAssignments.push({ classId, roomRef });
        }

        return parsedAssignments;
    }

    private async applyAssignmentDiff(fetchedAssignments: IClassAssignment[]): Promise<void> {
        const nextKnown = new Map(this.knownAssignments);
        const desiredMap = new Map(fetchedAssignments.map((a) => [a.classId, a.roomRef]));

        const joins: IClassAssignment[] = [];
        const leaves: Array<{ classId: string; known: IKnownAssignment; changingTarget: boolean }> = [];

        for (const [classId, desiredRoomRef] of desiredMap) {
            const known = this.knownAssignments.get(classId);

            if (!known) {
                joins.push({ classId, roomRef: desiredRoomRef });
                continue;
            }

            const knownRef = normalizeTarget(known.roomRef);
            const desiredRef = normalizeTarget(desiredRoomRef);
            const knownResolvedRef = known.resolvedRoomId ? normalizeTarget(known.resolvedRoomId) : null;

            if (knownRef === desiredRef || knownResolvedRef === desiredRef) {
                nextKnown.set(classId, { roomRef: desiredRoomRef, resolvedRoomId: known.resolvedRoomId });
                continue;
            }

            joins.push({ classId, roomRef: desiredRoomRef });
            leaves.push({ classId, known, changingTarget: true });
        }

        for (const [classId, known] of this.knownAssignments) {
            if (!desiredMap.has(classId)) {
                leaves.push({ classId, known, changingTarget: false });
            }
        }

        for (const assignment of joins) {
            const retryKey = buildRetryKey("join", assignment.classId, assignment.roomRef);
            try {
                const roomId = await this.joinChannel(assignment.roomRef);
                nextKnown.set(assignment.classId, { roomRef: assignment.roomRef, resolvedRoomId: roomId || undefined });
                this.clearRetry(retryKey);
            } catch (error) {
                logger.error(
                    `[LMSClassChannelSyncStore] Failed to provision channel for class ${assignment.classId} (${assignment.roomRef})`,
                    error,
                );
                this.scheduleRetry({
                    key: retryKey,
                    operation: "join",
                    classId: assignment.classId,
                    target: assignment.roomRef,
                });
            }
        }

        for (const leaveCandidate of leaves) {
            const leaveTarget = leaveCandidate.known.resolvedRoomId || leaveCandidate.known.roomRef;

            if (leaveCandidate.changingTarget) {
                const desiredRoomRef = desiredMap.get(leaveCandidate.classId);
                const joinedAssignment = desiredRoomRef ? nextKnown.get(leaveCandidate.classId) : undefined;
                if (!desiredRoomRef || !joinedAssignment || normalizeTarget(joinedAssignment.roomRef) !== normalizeTarget(desiredRoomRef)) {
                    continue; // keep existing channel until the new one is successfully joined
                }
            }

            if (this.isStillNeededByAnotherClass(leaveCandidate.classId, leaveTarget, nextKnown)) {
                if (!leaveCandidate.changingTarget) {
                    nextKnown.delete(leaveCandidate.classId);
                }
                continue;
            }

            const retryKey = buildRetryKey("leave", leaveCandidate.classId, leaveTarget);

            try {
                await this.leaveChannel(leaveTarget);
                this.clearRetry(retryKey);
                if (!leaveCandidate.changingTarget) {
                    nextKnown.delete(leaveCandidate.classId);
                }
            } catch (error) {
                logger.error(
                    `[LMSClassChannelSyncStore] Failed to revoke channel for class ${leaveCandidate.classId} (${leaveTarget})`,
                    error,
                );

                if (!leaveCandidate.changingTarget) {
                    nextKnown.set(leaveCandidate.classId, leaveCandidate.known);
                }

                this.scheduleRetry({
                    key: retryKey,
                    operation: "leave",
                    classId: leaveCandidate.classId,
                    target: leaveTarget,
                });
            }
        }

        this.knownAssignments.clear();
        for (const [classId, known] of nextKnown) {
            this.knownAssignments.set(classId, known);
        }
    }

    private isStillNeededByAnotherClass(classId: string, target: string, knownAssignments: Map<string, IKnownAssignment>): boolean {
        const normalizedTarget = normalizeTarget(target);

        for (const [otherClassId, desiredTarget] of this.desiredAssignments) {
            if (otherClassId === classId) continue;
            if (normalizeTarget(desiredTarget) === normalizedTarget) {
                return true;
            }
        }

        for (const [otherClassId, known] of knownAssignments) {
            if (otherClassId === classId) continue;
            if (normalizeTarget(known.roomRef) === normalizedTarget) return true;
            if (known.resolvedRoomId && normalizeTarget(known.resolvedRoomId) === normalizedTarget) return true;
        }

        return false;
    }

    private async joinChannel(target: string): Promise<string | null> {
        const client = this.matrixClient;
        if (!client) return null;

        const room = client.getRoom(target);
        if (room?.getMyMembership() === "join") {
            return room.roomId;
        }

        const joinedRoom = await client.joinRoom(target);
        return joinedRoom.roomId || null;
    }

    private async leaveChannel(target: string): Promise<void> {
        const client = this.matrixClient;
        if (!client) return;

        const room = client.getRoom(target);
        if (room && room.getMyMembership() !== "join") {
            return;
        }

        await client.leave(target);
    }

    private scheduleRetry(task: IRetryTask): void {
        const syncCfg = SdkConfig.get("lms_class_channel_sync");
        const maxAttempts =
            typeof syncCfg?.retry_max_attempts === "number" && syncCfg.retry_max_attempts > 0
                ? syncCfg.retry_max_attempts
                : DEFAULT_RETRY_MAX_ATTEMPTS;

        const baseDelayMs =
            typeof syncCfg?.retry_base_delay_ms === "number" && syncCfg.retry_base_delay_ms > 0
                ? syncCfg.retry_base_delay_ms
                : DEFAULT_RETRY_BASE_DELAY_MS;

        const attempt = (this.retryAttempts.get(task.key) || 0) + 1;
        this.retryAttempts.set(task.key, attempt);

        if (attempt > maxAttempts) {
            logger.error(
                `[LMSClassChannelSyncStore] Retry limit reached for ${task.operation} on class ${task.classId} (${task.target})`,
            );
            this.clearRetry(task.key);
            return;
        }

        const existingTimeout = this.retryTimeouts.get(task.key);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }

        this.retryTasks.set(task.key, task);

        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        const timeoutId = setTimeout(async () => {
            this.retryTimeouts.delete(task.key);

            const pending = this.retryTasks.get(task.key);
            if (!pending) return;

            if (this.shouldSkipRetryTask(pending)) {
                this.clearRetry(task.key);
                return;
            }

            try {
                // Never mutate memberships or assignment state directly from retry callbacks.
                // Retries must go through the same serialized sync path to avoid interleaving
                // with applyAssignmentDiff() and losing updates.
                if (this.syncInFlight) {
                    this.requestSync("retry_queued");
                    this.scheduleRetry(pending);
                    return;
                }

                await this.syncClassAssignments("retry_execute");

                // If the sync already scheduled another retry for this key, do not duplicate timers.
                if (this.retryTimeouts.has(task.key)) {
                    return;
                }

                // Successful syncs clear retry keys during applyAssignmentDiff via clearRetry().
                if (!this.retryTasks.has(task.key)) {
                    return;
                }

                if (this.shouldSkipRetryTask(pending)) {
                    this.clearRetry(task.key);
                    return;
                }

                this.scheduleRetry(pending);
            } catch (error) {
                logger.warn(
                    `[LMSClassChannelSyncStore] Retry ${attempt} failed while triggering sync for ${pending.operation} on class ${pending.classId}`,
                    error,
                );
                this.scheduleRetry(pending);
            }
        }, delay);

        this.retryTimeouts.set(task.key, timeoutId);
    }

    private shouldSkipRetryTask(task: IRetryTask): boolean {
        const desiredTarget = this.desiredAssignments.get(task.classId);

        if (task.operation === "join") {
            if (!desiredTarget) return true;
            return normalizeTarget(desiredTarget) !== normalizeTarget(task.target);
        }

        if (desiredTarget && normalizeTarget(desiredTarget) === normalizeTarget(task.target)) {
            return true;
        }

        return this.isStillNeededByAnotherClass(task.classId, task.target, this.knownAssignments);
    }

    private clearRetry(key: string): void {
        const timeout = this.retryTimeouts.get(key);
        if (timeout) {
            clearTimeout(timeout);
            this.retryTimeouts.delete(key);
        }
        this.retryAttempts.delete(key);
        this.retryTasks.delete(key);
    }
}
