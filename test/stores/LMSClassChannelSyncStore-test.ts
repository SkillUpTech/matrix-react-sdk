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

import { MatrixClient } from "matrix-js-sdk/src/client";

import SdkConfig from "../../src/SdkConfig";
import { LMSClassChannelSyncStore } from "../../src/stores/LMSClassChannelSyncStore";
import { stubClient } from "../test-utils";

describe("LMSClassChannelSyncStore", () => {
    let client: MatrixClient;
    let originalFetch: typeof global.fetch;

    beforeAll(() => {
        originalFetch = global.fetch;
    });

    beforeEach(() => {
        jest.restoreAllMocks();
        SdkConfig.reset();
        client = stubClient();
        global.fetch = jest.fn() as unknown as typeof fetch;
        (client as any).leave = jest.fn().mockResolvedValue(undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        SdkConfig.reset();
        global.fetch = originalFetch;
    });

    function makeStore(): LMSClassChannelSyncStore {
        // @ts-ignore bypass private ctor for tests
        const store = new LMSClassChannelSyncStore() as LMSClassChannelSyncStore;
        // Inject test client into AsyncStoreWithClient dependency chain
        (store as any).readyStore = {
            mxClient: client,
        };
        return store;
    }

    it("fetches classes using default LMS endpoint and parses assignment variants", async () => {
        jest.spyOn(client, "getUserIdLocalpart").mockReturnValue("student.01");

        SdkConfig.add({
            lms_base_url: "https://lms.example.org/",
            lms_class_channel_sync: {
                enabled: true,
            },
        });

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                classes: [
                    { id: "CLS-1", room_id: "!room1:example.org" },
                    { class_id: "CLS-2", room_alias: "#class-2:example.org" },
                    { course_id: "CLS-3", channel: { room_alias: "#class-3:example.org" } },
                    { classCode: "CLS-4", room: { room_id: "!room4:example.org" } },
                    { code: "CLS-5", communication_channel: { channel_alias: "#class-5:example.org" } },
                    { id: "CLS-BAD" },
                ],
            }),
        });

        const store = makeStore();
        const assignments = await (store as any).fetchDesiredAssignments();

        expect(global.fetch).toHaveBeenCalledWith(
            "https://lms.example.org/oauth2/getuserclasses/student.01",
            expect.objectContaining({ method: "GET" }),
        );
        expect(assignments).toEqual([
            { classId: "CLS-1", roomRef: "!room1:example.org" },
            { classId: "CLS-2", roomRef: "#class-2:example.org" },
            { classId: "CLS-3", roomRef: "#class-3:example.org" },
            { classId: "CLS-4", roomRef: "!room4:example.org" },
            { classId: "CLS-5", roomRef: "#class-5:example.org" },
        ]);
    });

    it("supports configurable classes_path for nested payloads", async () => {
        SdkConfig.add({
            lms_base_url: "https://lms.example.org",
            lms_class_channel_sync: {
                enabled: true,
                classes_path: "data.current_classes",
            },
        });

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                data: {
                    current_classes: [{ slug: "CLS-NESTED", matrix_room_alias: "#nested:example.org" }],
                },
            }),
        });

        const store = makeStore();
        const assignments = await (store as any).fetchDesiredAssignments();

        expect(assignments).toEqual([{ classId: "CLS-NESTED", roomRef: "#nested:example.org" }]);
    });

    it("returns no assignments when LMS base URL is missing and classes_endpoint is unset", async () => {
        SdkConfig.add({
            lms_class_channel_sync: {
                enabled: true,
            },
        });

        const store = makeStore();
        const assignments = await (store as any).fetchDesiredAssignments();

        expect(assignments).toEqual([]);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("returns no assignments when LMS base URL is whitespace and classes_endpoint is unset", async () => {
        SdkConfig.add({
            lms_base_url: "   ",
            lms_class_channel_sync: {
                enabled: true,
            },
        });

        const store = makeStore();
        const assignments = await (store as any).fetchDesiredAssignments();

        expect(assignments).toEqual([]);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("trims LMS base URL before building the default classes endpoint", async () => {
        jest.spyOn(client, "getUserIdLocalpart").mockReturnValue("student.01");

        SdkConfig.add({
            lms_base_url: "  https://lms.example.org/  ",
            lms_class_channel_sync: {
                enabled: true,
            },
        });

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ classes: [] }),
        });

        const store = makeStore();
        await (store as any).fetchDesiredAssignments();

        expect(global.fetch).toHaveBeenCalledWith(
            "https://lms.example.org/oauth2/getuserclasses/student.01",
            expect.objectContaining({ method: "GET" }),
        );
    });

    it("uses classes_endpoint without requiring LMS base URL", async () => {
        SdkConfig.add({
            lms_class_channel_sync: {
                enabled: true,
                classes_endpoint: "https://sync.example.org/classes/me",
            },
        });

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                classes: [{ id: "CLS-OVERRIDE", room_alias: "#override:example.org" }],
            }),
        });

        const store = makeStore();
        const assignments = await (store as any).fetchDesiredAssignments();

        expect(global.fetch).toHaveBeenCalledWith(
            "https://sync.example.org/classes/me",
            expect.objectContaining({ method: "GET" }),
        );
        expect(assignments).toEqual([{ classId: "CLS-OVERRIDE", roomRef: "#override:example.org" }]);
    });

    it("stays inactive when sync is enabled but neither classes_endpoint nor lms_base_url is configured", async () => {
        SdkConfig.add({
            lms_class_channel_sync: {
                enabled: true,
            },
        });

        const store = makeStore() as any;
        const requestSyncSpy = jest.spyOn(store, "requestSync");

        await store.onReady();

        expect(store.state.active).toBe(false);
        expect(store.state.lastSyncTs).toBeNull();
        expect(requestSyncSpy).not.toHaveBeenCalled();
        expect(store.pollHandle).toBeUndefined();
    });

    it("stays inactive when sync is enabled and lms_base_url is whitespace with no classes_endpoint", async () => {
        SdkConfig.add({
            lms_base_url: "   ",
            lms_class_channel_sync: {
                enabled: true,
            },
        });

        const store = makeStore() as any;
        const requestSyncSpy = jest.spyOn(store, "requestSync");

        await store.onReady();

        expect(store.state.active).toBe(false);
        expect(requestSyncSpy).not.toHaveBeenCalled();
        expect(store.pollHandle).toBeUndefined();
    });

    it("does not leave a channel still required by another class", async () => {
        SdkConfig.add({
            lms_base_url: "https://lms.example.org",
            lms_class_channel_sync: {
                enabled: true,
            },
        });

        const store = makeStore() as any;
        store.knownAssignments.set("CLASS-A", { roomRef: "#shared:example.org" });
        store.knownAssignments.set("CLASS-B", { roomRef: "#shared:example.org" });
        store.desiredAssignments = new Map([["CLASS-B", "#shared:example.org"]]);

        const leaveSpy = jest.spyOn(client as any, "leave").mockResolvedValue(undefined);
        const joinSpy = jest.spyOn(client, "joinRoom").mockResolvedValue({ roomId: "!shared:example.org" } as any);

        await store.applyAssignmentDiff([{ classId: "CLASS-B", roomRef: "#shared:example.org" }]);

        expect(leaveSpy).not.toHaveBeenCalled();
        expect(joinSpy).not.toHaveBeenCalled();
        expect(store.knownAssignments.has("CLASS-A")).toBe(false);
        expect(store.knownAssignments.has("CLASS-B")).toBe(true);
    });

    it("does not leave resolved room when another class still desires the same alias and join has not succeeded yet", async () => {
        SdkConfig.add({
            lms_base_url: "https://lms.example.org",
            lms_class_channel_sync: {
                enabled: true,
            },
        });

        const store = makeStore() as any;
        store.knownAssignments.set("CLASS-A", {
            roomRef: "#shared:example.org",
            resolvedRoomId: "!shared:example.org",
        });
        store.desiredAssignments = new Map([["CLASS-B", "#shared:example.org"]]);

        const leaveSpy = jest.spyOn(client as any, "leave").mockResolvedValue(undefined);
        jest.spyOn(store, "joinChannel" as any).mockRejectedValue(new Error("join failed"));

        await store.applyAssignmentDiff([{ classId: "CLASS-B", roomRef: "#shared:example.org" }]);

        expect(leaveSpy).not.toHaveBeenCalled();
        expect(store.knownAssignments.has("CLASS-A")).toBe(false);
        expect(store.retryTasks.has("join|CLASS-B|#shared:example.org")).toBe(true);
    });

    it("throws when trying to join without a Matrix client", async () => {
        const store = makeStore() as any;
        store.readyStore.mxClient = null;

        await expect(store.joinChannel("!room:example.org")).rejects.toThrow(
            "Matrix client is not available for join operation",
        );
    });

    it("throws when trying to leave without a Matrix client", async () => {
        const store = makeStore() as any;
        store.readyStore.mxClient = null;

        await expect(store.leaveChannel("!room:example.org")).rejects.toThrow(
            "Matrix client is not available for leave operation",
        );
    });

    it("scheduleRetry uses exponential delay and clears when max attempts are exceeded", () => {
        jest.useFakeTimers();

        SdkConfig.add({
            lms_class_channel_sync: {
                retry_base_delay_ms: 100,
                retry_max_attempts: 2,
            },
        });

        const store = makeStore() as any;
        const task = {
            key: "join|CLS|#room:example.org",
            operation: "join",
            classId: "CLS",
            target: "#room:example.org",
        };

        store.scheduleRetry(task);
        expect(store.retryAttempts.get(task.key)).toBe(1);

        const timeoutA = store.retryTimeouts.get(task.key);
        store.scheduleRetry(task);
        expect(store.retryAttempts.get(task.key)).toBe(2);
        const timeoutB = store.retryTimeouts.get(task.key);
        expect(timeoutB).toBeDefined();
        expect(timeoutB).not.toBe(timeoutA);

        store.scheduleRetry(task);
        expect(store.retryAttempts.has(task.key)).toBe(false);
        expect(store.retryTasks.has(task.key)).toBe(false);
        expect(store.retryTimeouts.has(task.key)).toBe(false);

        jest.useRealTimers();
    });

    it("does not schedule retry timers when Matrix client is unavailable", () => {
        jest.useFakeTimers();

        const store = makeStore() as any;
        store.readyStore.mxClient = null;

        const task = {
            key: "leave|CLS-NOCLIENT|!room:example.org",
            operation: "leave",
            classId: "CLS-NOCLIENT",
            target: "!room:example.org",
        };

        store.scheduleRetry(task);

        expect(store.retryAttempts.has(task.key)).toBe(false);
        expect(store.retryTasks.has(task.key)).toBe(false);
        expect(store.retryTimeouts.has(task.key)).toBe(false);

        jest.useRealTimers();
    });

    it("does not increment attempts when retry is re-queued during in-flight sync", async () => {
        jest.useFakeTimers();

        SdkConfig.add({
            lms_class_channel_sync: {
                retry_base_delay_ms: 10,
                retry_max_attempts: 5,
            },
        });

        const store = makeStore() as any;
        const task = {
            key: "join|CLS2|#room2:example.org",
            operation: "join",
            classId: "CLS2",
            target: "#room2:example.org",
        };

        store.syncInFlight = true;
        store.desiredAssignments = new Map([["CLS2", "#room2:example.org"]]);
        store.shouldSkipRetryTask = jest.fn().mockReturnValue(false);
        store.requestSync = jest.fn();

        store.scheduleRetry(task);
        expect(store.retryAttempts.get(task.key)).toBe(1);

        jest.advanceTimersByTime(10);
        await Promise.resolve();

        expect(store.requestSync).toHaveBeenCalledWith("retry_queued");
        expect(store.retryAttempts.get(task.key)).toBe(1);

        jest.useRealTimers();
    });

    it("clears stale join retry when desired assignment changes", async () => {
        jest.useFakeTimers();

        SdkConfig.add({
            lms_class_channel_sync: {
                retry_base_delay_ms: 10,
                retry_max_attempts: 5,
            },
        });

        const store = makeStore() as any;
        const task = {
            key: "join|CLS3|#old:example.org",
            operation: "join",
            classId: "CLS3",
            target: "#old:example.org",
        };

        store.desiredAssignments = new Map([["CLS3", "#new:example.org"]]);

        store.scheduleRetry(task);
        expect(store.retryTasks.has(task.key)).toBe(true);

        jest.advanceTimersByTime(10);
        await Promise.resolve();

        expect(store.retryTasks.has(task.key)).toBe(false);
        expect(store.retryAttempts.has(task.key)).toBe(false);
        expect(store.retryTimeouts.has(task.key)).toBe(false);

        jest.useRealTimers();
    });

    it("skips leave retry when alias roomRef becomes desired again", () => {
        const store = makeStore() as any;
        store.desiredAssignments = new Map([["CLASS-B", "#shared:example.org"]]);

        const shouldSkip = store.shouldSkipRetryTask({
            key: "leave|CLASS-A|!shared:example.org",
            operation: "leave",
            classId: "CLASS-A",
            target: "!shared:example.org",
            roomRef: "#shared:example.org",
        });

        expect(shouldSkip).toBe(true);
    });
});
