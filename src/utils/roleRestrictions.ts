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

import { _t } from "../languageHandler";
import GenericToast from "../components/views/toasts/GenericToast";
import ToastStore from "../stores/ToastStore";

const STUDENT_ROLE_ACTION_DISABLED_TOAST_KEY = "student_role_action_disabled";

export const showStudentRoleActionDisabledToast = (): void => {
    ToastStore.sharedInstance().addOrReplaceToast({
        key: STUDENT_ROLE_ACTION_DISABLED_TOAST_KEY,
        title: _t("Action unavailable"),
        component: GenericToast,
        priority: 80,
        props: {
            description: _t("This action is disabled for your role"),
            acceptLabel: _t("OK"),
            onAccept: () => {
                ToastStore.sharedInstance().dismissToast(STUDENT_ROLE_ACTION_DISABLED_TOAST_KEY);
            },
        },
    });
};
