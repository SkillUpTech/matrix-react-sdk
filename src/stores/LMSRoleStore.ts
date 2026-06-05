/*
Copyright 2024 DGE

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

export type LMSRole = string;

interface IState {
    role: LMSRole | null;
    fetched: boolean;
}

/**
 * Fetches and caches the current user's LMS role from the platform API.
 *
 * Role is fetched on every page load (onReady) to prevent stale client-side
 * values. Stored in memory only — never persisted to localStorage — so it
 * cannot be tampered with between sessions.
 *
 * isStudent() defaults to true (most restrictive) when the role has not yet
 * been fetched or when the API call fails, ensuring UI restrictions are applied
 * in the absence of a confirmed non-student role.
 */
export class LMSRoleStore extends AsyncStoreWithClient<IState> {
    private static readonly internalInstance = (() => {
        const instance = new LMSRoleStore();
        instance.start();
        return instance;
    })();

    private constructor() {
        super(defaultDispatcher, { role: null, fetched: false });
    }

    public static get instance(): LMSRoleStore {
        return LMSRoleStore.internalInstance;
    }

    public getRole(): LMSRole | null {
        return this.state.role;
    }

    /**
     * Returns true when the user is a Student, or when the role is not yet
     * known (fetch pending or failed). Callers should treat an unknown role as
     * student-level access until confirmed otherwise.
     */
    public isStudent(): boolean {
        if (!this.state.fetched) return true;
        if (this.state.role === null) return true;
        return this.state.role.toLowerCase() === "student";
    }

    protected async onReady(): Promise<void> {
        if (!this.matrixClient) return;
        await this.fetchRole();
    }

    protected async onNotReady(): Promise<void> {
        await this.updateState({ role: null, fetched: false });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected async onAction(payload: ActionPayload): Promise<void> {
        // no-op
    }

    private async fetchRole(): Promise<void> {
        const client = this.matrixClient;
        if (!client) return;

        const lmsBaseUrl = SdkConfig.get("lms_base_url");
        if (!lmsBaseUrl) {
            logger.warn("[LMSRoleStore] lms_base_url not configured — role restrictions will apply");
            await this.updateState({ role: null, fetched: true });
            return;
        }

        const userId = client.getUserId();
        if (!userId) return;

        // Matrix user ID format: @username:server.com → extract "username"
        const colonIdx = userId.indexOf(":");
        const username = userId.slice(1, colonIdx > 0 ? colonIdx : undefined);

        try {
            const base = lmsBaseUrl.replace(/\/$/, "");
            const url = `${base}/oauth2/getuserinfo/${encodeURIComponent(username)}`;
            const response = await fetch(url, { method: "GET" });

            if (!response.ok) {
                logger.warn(`[LMSRoleStore] Role fetch failed: HTTP ${response.status} — defaulting to Student`);
                await this.updateState({ role: null, fetched: true });
                return;
            }

            const data = await response.json();
            const role: LMSRole | null = typeof data.user_role === "string" ? data.user_role : null;
            logger.info(`[LMSRoleStore] Role fetched for ${username}: ${role}`);
            await this.updateState({ role, fetched: true });
        } catch (e) {
            logger.error("[LMSRoleStore] Network error fetching role — defaulting to Student:", e);
            await this.updateState({ role: null, fetched: true });
        }
    }
}
