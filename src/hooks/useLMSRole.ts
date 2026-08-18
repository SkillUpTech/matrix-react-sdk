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

import { useState } from "react";

import { LMSRoleStore } from "../stores/LMSRoleStore";
import { UPDATE_EVENT } from "../stores/AsyncStore";
import { useEventEmitter } from "./useEventEmitter";

/**
 * True while the current user is a Student, or while their role is still unknown.
 *
 * The role is fetched asynchronously after login, so a component that reads
 * isStudent() once at mount would render its student view and never correct
 * itself. Subscribing to the store re-renders when the role lands.
 *
 * This gates visibility only. Enforcement is the homeserver's job, via the room
 * power levels set at provisioning.
 */
export const useIsStudent = (): boolean => {
    const [isStudent, setIsStudent] = useState(() => LMSRoleStore.instance.isStudent());
    useEventEmitter(LMSRoleStore.instance, UPDATE_EVENT, () => {
        setIsStudent(LMSRoleStore.instance.isStudent());
    });
    return isStudent;
};
