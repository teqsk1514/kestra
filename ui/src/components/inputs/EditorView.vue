<script setup>
    import {ref, onMounted, watch, getCurrentInstance, onBeforeUnmount, computed} from "vue";
    import {useStore} from "vuex"

    // Icons
    import ContentSave from "vue-material-design-icons/ContentSave.vue";
    import LightningBolt from "vue-material-design-icons/LightningBolt.vue";
    import FileEdit from "vue-material-design-icons/FileEdit.vue";
    import Exclamation from "vue-material-design-icons/Exclamation.vue";
    import DotsVertical from "vue-material-design-icons/DotsVertical.vue";
    import ContentCopy from "vue-material-design-icons/ContentCopy.vue";
    import Delete from "vue-material-design-icons/Delete.vue";

    import BottomLine from "../layout/BottomLine.vue";
    import TriggerFlow from "../flows/TriggerFlow.vue";
    import ValidationError from "../flows/ValidationError.vue";
    import Blueprints from "../flows/blueprints/Blueprints.vue";
    import SwitchView from "./SwitchView.vue";
    import PluginDocumentation from "../plugins/PluginDocumentation.vue";
    import permission from "../../models/permission";
    import action from "../../models/action";
    import YamlUtils from "../../utils/yamlUtils";
    import taskEditor from "../flows/TaskEditor.vue";
    import metadataEditor from "../flows/MetadataEditor.vue";
    import editor from "./Editor.vue";
    import yamlUtils from "../../utils/yamlUtils";
    import {pageFromRoute} from "../../utils/eventsRouter";
    import {SECTIONS} from "../../utils/constants.js";
    import LowCodeEditor from "../inputs/LowCodeEditor.vue";

    const store = useStore();
    const router = getCurrentInstance().appContext.config.globalProperties.$router;
    const emit = defineEmits(["follow"])
    const toast = getCurrentInstance().appContext.config.globalProperties.$toast();
    const t = getCurrentInstance().appContext.config.globalProperties.$t;
    const http = getCurrentInstance().appContext.config.globalProperties.$http;
    const tours = getCurrentInstance().appContext.config.globalProperties.$tours;
    const lowCodeEditorRef = ref(null);

    const props = defineProps({
        flowGraph: {
            type: Object,
            required: false,
            default: undefined
        },
        flowId: {
            type: String,
            required: false,
            default: undefined
        },
        flow: {
            type: Object,
            required: false,
            default: undefined
        },
        namespace: {
            type: String,
            required: false,
            default: undefined
        },
        execution: {
            type: Object,
            default: undefined
        },
        isCreating: {
            type: Boolean,
            default: false
        },
        isReadOnly: {
            type: Boolean,
            default: true
        },
        graphOnly: {
            type: Boolean,
            default: false
        },
        sourceCopy: {
            type: String,
            default: null
        },
        total: {
            type: Number,
            default: null
        },
        guidedProperties: {
            type: Object,
            default: {
                tourStarted: false
            }
        },
        flowError: {
            type: String,
            default: undefined
        }
    })

    const viewTypeStorageKey = "view-type";

    const loadViewType = () => {
        return localStorage.getItem(viewTypeStorageKey);
    }

    const initViewType = () => {
        const defaultValue = "source-doc";

        if (props.execution || props.isReadOnly) {
            return "topology";
        }

        const storedValue = loadViewType();
        if (storedValue) {
            return storedValue;
        }

        localStorage.setItem(viewTypeStorageKey, defaultValue);
        return defaultValue;
    }

    const isHorizontalDefault = () => {
        return viewType.value === "source-topology" ? false : localStorage.getItem("topology-orientation") === "1"
    }

    const editorDomElement = ref(null);
    const editorWidthStorageKey = "editor-width";
    const editorWidthPercentage = ref(localStorage.getItem(editorWidthStorageKey));
    const isLoading = ref(false);
    const haveChange = ref(false)
    const flowYaml = ref("")
    const newTrigger = ref(null)
    const isNewTriggerOpen = ref(false)
    const newError = ref(null)
    const isNewErrorOpen = ref(false)
    const isEditMetadataOpen = ref(false)
    const metadata = ref(null);
    const viewType = ref(initViewType());
    const isHorizontal = ref(isHorizontalDefault());
    const updatedFromEditor = ref(false);
    const timer = ref(null);
    const taskError = ref(store.getters["flow/taskError"])
    const user = store.getters["auth/user"];
    const routeParams = router.currentRoute.value.params;

    const persistViewType = (value) => {
        viewType.value = value;
        localStorage.setItem(viewTypeStorageKey, value);
    }

    const localStorageKey = computed(() => {
        return (props.isCreating ? "creation" : `${props.flow.namespace}.${props.flow.id}`) + "_draft";
    })

    const autoRestorelocalStorageKey = computed(() => {
        return "autoRestore-"+localStorageKey.value;
    })

    watch(() => store.getters["flow/taskError"], async () => {
        taskError.value = store.getters["flow/taskError"];
    });

    const flowHaveTasks = (source) => {
        const flow = source ? source : flowYaml.value
        return flow ? YamlUtils.flowHaveTasks(flow) : false;
    }

    const initYamlSource = async () => {
        flowYaml.value = props.flow ? props.flow.source : YamlUtils.stringify({
            id: props.flowId,
            namespace: props.namespace
        });

        if(!props.isCreating && !props.isReadOnly) {
            const validation = await store.dispatch("flow/validateFlow", {flow: flowYaml.value});
            const validationErrors = validation[0].constraints;
            if (validationErrors) {
                singleErrorToast(t("cannot create topology"), t("invalid flow"), validationErrors);
            }else {
                generateGraph();
            }
        } else {
            generateGraph();
        }

        if(!props.isReadOnly) {
            let restoredLocalStorageKey;
            const sourceFromLocalStorage = localStorage.getItem((restoredLocalStorageKey = autoRestorelocalStorageKey.value)) ?? localStorage.getItem((restoredLocalStorageKey = localStorageKey.value));
            if (sourceFromLocalStorage !== null) {
                if(restoredLocalStorageKey === autoRestorelocalStorageKey.value){
                    onEdit(sourceFromLocalStorage);
                }else {
                    toast.confirm(props.isCreating ? t("save draft.retrieval.creation") : t("save draft.retrieval.existing", {flowFullName: `${props.flow.namespace}.${props.flow.id}`}), () => {
                        onEdit(sourceFromLocalStorage);
                    })
                }

                localStorage.removeItem(restoredLocalStorageKey);
            }
        }
    }

    const persistEditorWidth = () => {
        if (editorWidthPercentage.value !== null) {
            localStorage.setItem(editorWidthStorageKey, editorWidthPercentage.value);
        }
    }

    onMounted(async () => {
        if (props.isCreating) {
            store.commit("flow/setFlowGraph", undefined);
        }
        await initYamlSource();
        // Save on ctrl+s in topology
        document.addEventListener("keydown", save);
        // Guided tour
        setTimeout(() => {
            if (!props.guidedProperties.tourStarted
                && localStorage.getItem("tourDoneOrSkip") !== "true"
                && props.total === 0) {
                tours["guidedTour"].start();
                persistViewType("source");
            }
        }, 200)
        window.addEventListener("popstate", () => {
            stopTour();
        });
        window.addEventListener("beforeunload", persistEditorWidth);
    })

    onBeforeUnmount(() => {
        store.commit("plugin/setEditorPlugin", undefined);
        document.removeEventListener("keydown", save);
        document.removeEventListener("popstate", () => {
            stopTour();
        });

        window.removeEventListener("beforeunload", persistEditorWidth);
        persistEditorWidth();

        // Will get redirected to login page
        if (!store.getters["auth/isLogged"] && haveChange.value) {
            persistEditorContent(true);
        }
    })


    const stopTour = () => {
        tours["guidedTour"].stop();
        store.commit("core/setGuidedProperties", {
            ...props.guidedProperties,
            tourStarted: false
        });
    }


    const viewTypeOnReadOnly = () => {
        const defaultValue = "source-topology";

        if (props.isCreating) {
            return "source";
        }

        if (props.execution || props.isReadOnly ) {
            return "topology";
        }

        const storedValue = loadViewType();
        if (storedValue) {
            return storedValue;
        }

        return defaultValue;
    }

    watch(() => props.isReadOnly, async () => {
        viewType.value = viewTypeOnReadOnly();
    });

    watch(() => props.guidedProperties, () => {
        if (localStorage.getItem("tourDoneOrSkip") !== "true") {
            if (props.guidedProperties.source !== undefined) {
                haveChange.value = true;
                flowYaml.value = props.guidedProperties.source
                updatedFromEditor.value = true;
            }
            if (props.guidedProperties.saveFlow) {
                save();
            }
        }
    });

    const isAllowedEdit = () => {
        return user && user.isAllowed(permission.FLOW, action.UPDATE, props.namespace);
    };

    const forwardEvent = (type, event) => {
        emit(type, event);
    };

    const updatePluginDocumentation = (event) => {
        const taskType = yamlUtils.getTaskType(event.model.getValue(), event.position)
        const pluginSingleList = store.getters["plugin/getPluginSingleList"];
        const pluginsDocumentation = store.getters["plugin/getPluginsDocumentation"];
        if (taskType && pluginSingleList && pluginSingleList.includes(taskType)) {
            if (!pluginsDocumentation[taskType]) {
                store
                    .dispatch("plugin/load", {cls: taskType})
                    .then(plugin => {
                        store.commit("plugin/setPluginsDocumentation", {...pluginsDocumentation, [taskType]: plugin});
                        store.commit("plugin/setEditorPlugin", plugin);
                    });
            } else if (pluginsDocumentation[taskType]) {
                store.commit("plugin/setEditorPlugin", pluginsDocumentation[taskType]);
            }
        } else {
            store.commit("plugin/setEditorPlugin", undefined);
        }
    };

    const persistEditorContent = (autoRestore) => {
        if(autoRestore && localStorage.getItem(localStorageKey.value)) {
            return;
        }

        localStorage.setItem(autoRestore ? autoRestorelocalStorageKey.value : localStorageKey.value, flowYaml.value);
        store.dispatch("core/isUnsaved", false);
        haveChange.value = false;
    }

    const singleErrorToast = (title, message, detailedError) => {
        store.dispatch("core/showMessage", {
            title: title,
            message: message,
            content: {
                _embedded: {
                    errors: [{message: detailedError}]
                }
            },
            variant: "error"
        });
    }

    const saveAsDraft = (errorMessage) => {
        singleErrorToast(t("save draft.message"), t("invalid flow"), errorMessage);
        persistEditorContent(false);
    }

    const onEdit = (event) => {
        flowYaml.value = event;
        haveChange.value = true;
        store.dispatch("core/isUnsaved", true);
        return store.dispatch("flow/validateFlow", {flow: event})
            .then(value => {
                if (flowHaveTasks() && ["topology", "source-topology"].includes(viewType.value)) {
                    store.dispatch("flow/loadGraphFromSource", {
                        flow: event, config: {
                            validateStatus: (status) => {
                                return status === 200 || status === 422;
                            }
                        }
                    })
                } else {
                    regenerateGraph();
                }

                return value;
            });
    }

    const generateGraph = () => {
        lowCodeEditorRef.value.generateGraph();
    }

    const regenerateGraph = () => {
        lowCodeEditorRef.value.regenerateGraph();
    }

    const loadingState = (value) => {
        isLoading.value = value;
    }

    const onUpdateNewTrigger = (event) => {
        clearTimeout(timer.value);
        timer.value = setTimeout(() => store.dispatch("flow/validateTask", {
            task: event,
            section: SECTIONS.TRIGGERS
        }), 500);
        newTrigger.value = event;
    }

    const onSaveNewTrigger = () => {
        const source = flowYaml.value;
        const existingTask = YamlUtils.checkTaskAlreadyExist(source, newTrigger.value);
        if (existingTask) {
            store.dispatch("core/showMessage", {
                variant: "error",
                title: "Trigger Id already exist",
                message: `Trigger Id ${existingTask} already exist in the flow.`
            });
            return;
        }
        onEdit(YamlUtils.insertTrigger(source, newTrigger.value));
        newTrigger.value = null;
        isNewTriggerOpen.value = false;
        haveChange.value = true;
    }

    const onUpdateNewError = (event) => {
        clearTimeout(timer.value);
        timer.value = setTimeout(() => store.dispatch("flow/validateTask", {
            task: event,
            section: SECTIONS.TASKS
        }), 500);

        newError.value = event;
    }

    const onSaveNewError = () => {
        const source = flowYaml.value;
        const existingTask = YamlUtils.checkTaskAlreadyExist(source, newError.value);
        if (existingTask) {
            store.dispatch("core/showMessage", {
                variant: "error",
                title: "Task Id already exist",
                message: `Task Id ${existingTask} already exist in the flow.`
            });
            return;
        }
        onEdit(YamlUtils.insertError(source, newError.value));
        newError.value = null;
        isNewErrorOpen.value = false;
        haveChange.value = true;
    }

    const getFlowMetadata = () => {
        return YamlUtils.getMetadata(flowYaml.value);
    }

    const checkRequiredMetadata = () => {
        if (metadata.value) {
            return metadata.value.id.length > 0 && metadata.value.namespace.length > 0
        }
        return getFlowMetadata().id.length > 0 && getFlowMetadata().namespace.length > 0
    }

    const onUpdateMetadata = (event) => {
        metadata.value = event;
    }

    const onSaveMetadata = () => {
        const source = flowYaml.value;
        flowYaml.value = YamlUtils.updateMetadata(source, metadata.value)
        metadata.value = null;
        isEditMetadataOpen.value = false;
        haveChange.value = true;
    }

    const editorUpdate = (event) => {
        updatedFromEditor.value = true;
        flowYaml.value = event;

        clearTimeout(timer.value);
        timer.value = setTimeout(() => onEdit(event), 500)
    }

    const switchView = (event) => {
        persistViewType(event);
        if (["topology", "source-topology"].includes(viewType.value)) {
            isHorizontal.value = isHorizontalDefault();
            if (updatedFromEditor.value) {
                onEdit(flowYaml.value)
                updatedFromEditor.value = false;
            }
        }
        if (event === "source" && editorDomElement?.value?.$el) {
            editorDomElement.value.$el.style = null;
        }
    }

    const save = (e) => {
        if (e) {
            if (e.type === "keydown") {
                if (!(e.keyCode === 83 && e.ctrlKey) || !haveChange.value) {
                    return;
                }
                e.preventDefault();
            }
        }
        if (tours["guidedTour"].isRunning.value && !props.guidedProperties.saveFlow) {
            store.dispatch("api/events", {
                type: "ONBOARDING",
                onboarding: {
                    step: tours["guidedTour"].currentStep._value,
                    action: "next",
                },
                page: pageFromRoute(router.currentRoute.value)
            });
            tours["guidedTour"].nextStep();
            return;
        }

        onEdit(flowYaml.value).then(validation => {
            let flowParsed;
            try {
                flowParsed = YamlUtils.parse(flowYaml.value);
            } catch (e) {
                console.log("Error while parsing flow : ", e);
            }
            if (validation[0].constraints) {
                saveAsDraft(validation[0].constraints);
                return;
            }

            if (props.isCreating) {
                store.dispatch("flow/createFlow", {flow: flowYaml.value})
                    .then((response) => {
                        toast.saved(response.id);
                        store.dispatch("core/isUnsaved", false);
                        router.push({
                            name: "flows/update",
                            params: {id: flowParsed.id, namespace: flowParsed.namespace, tab: "editor"}
                        });
                    })
            }else {
                if(routeParams.id !== flowParsed.id || routeParams.namespace !== flowParsed.namespace){
                    store.dispatch("core/showMessage", {
                        variant: "error",
                        title: t("can not save"),
                        message: t("namespace and id readonly"),
                    })
                    flowYaml.value = YamlUtils.replaceIdAndNamespace(flowYaml.value, routeParams.id, routeParams.namespace);
                    return;
                }
                store.dispatch("flow/saveFlow", {flow: flowYaml.value})
                    .then((response) => {
                        toast.saved(response.id);
                        store.dispatch("core/isUnsaved", false);
                    })
            }

            haveChange.value = false;
        })
    };

    const canDelete = () => {
        return (
            user.isAllowed(
                permission.FLOW,
                action.DELETE,
                namespace
            )
        );
    }

    const deleteFlow = () => {
        const metadata = getFlowMetadata();

        return http
            .get(`/api/v1/flows/${metadata.namespace}/${metadata.id}/dependencies`, {params: {destinationOnly: true}})
            .then(response => {
                let warning = "";

                if (response.data && response.data.nodes) {
                    const deps = response.data.nodes
                        .filter(n => !(n.namespace === metadata.namespace && n.id === metadata.id))
                        .map(n => "<li>" + n.namespace + ".<code>" + n.id + "</code></li>")
                        .join("\n");

                    warning = "<div class=\"el-alert el-alert--warning is-light mt-3\" role=\"alert\">\n" +
                        "<div class=\"el-alert__content\">\n" +
                        "<p class=\"el-alert__description\">\n" +
                        t("dependencies delete flow") +
                        "<ul>\n" +
                        deps +
                        "</ul>\n" +
                        "</p>\n" +
                        "</div>\n" +
                        "</div>"
                }

                return t("delete confirm", {name: metadata.id}) + warning;
            }).then(message => {
                toast
                    .confirm(message, () => {
                        return store
                            .dispatch("flow/deleteFlow", metadata)
                            .then(() => {
                                return router.push({
                                    name: "flows/list"
                                });
                            })
                            .then(() => {
                                toast.deleted(metadata.id);
                            })
                    });
            });
    }

    const combinedEditor = computed(() => ["source-doc","source-topology","source-blueprints"].includes(viewType.value));

    const dragEditor = (e) => {
        let dragX = e.clientX;
        let blockWidth = editorDomElement.value.$el.offsetWidth;
        let parentWidth = editorDomElement.value.$el.parentNode.offsetWidth;
        let blockWidthPercent = (blockWidth / parentWidth) * 100;

        document.onmousemove = function onMouseMove(e) {
            const percent = (blockWidthPercent + ((e.clientX - dragX) / parentWidth) * 100);
            if(percent > 75 ){
                editorWidthPercentage.value = 75 + "%";
            } else if(percent < 25){
                editorWidthPercentage.value = 25 + "%";
            } else {
                editorWidthPercentage.value = percent + "%";
            }
        }

        document.onmouseup = () => {
            document.onmousemove = document.onmouseup = null;
        }
    }
</script>

<template>
    <el-card shadow="never" v-loading="isLoading">
        <editor
            ref="editorDomElement"
            v-if="combinedEditor || viewType === 'source'"
            :class="combinedEditor ? 'editor-combined' : ''"
            :style="combinedEditor ? {width: editorWidthPercentage} : {}"
            @save="save"
            v-model="flowYaml"
            schema-type="flow"
            lang="yaml"
            @update:model-value="editorUpdate($event)"
            @cursor="updatePluginDocumentation($event)"
            :creating="isCreating"
            @restartGuidedTour="() => persistViewType('source')"
        />
        <div class="slider" @mousedown="dragEditor" v-if="combinedEditor" />
        <Blueprints v-if="viewType === 'source-blueprints'" embed class="combined-right-view enhance-readability" :top-navbar="false" prevent-route-info/>
        <div
            :class="viewType === 'source-topology' ? 'combined-right-view' : viewType === 'topology' ? 'vueflow': 'hide-view'"
        >
            <LowCodeEditor
                ref="lowCodeEditorRef"
                @follow="forwardEvent('follow', $event)"
                @on-edit="onEdit"
                @loading="loadingState"
                :flow-graph="flowGraph"
                :flow-id="flowId"
                :namespace="namespace"
                :execution="execution"
                :is-read-only="isReadOnly"
                :source="flowYaml"
                :is-allowed-edit="isAllowedEdit()"
                :view-type="viewType"
            />
        </div>
        <PluginDocumentation
            v-if="viewType === 'source-doc'"
            class="plugin-doc combined-right-view enhance-readability"
        />
        <el-drawer
            v-if="isNewErrorOpen"
            v-model="isNewErrorOpen"
            title="Add a global error handler"
            destroy-on-close
            size=""
            :append-to-body="true"
        >
            <el-form label-position="top">
                <task-editor
                    :section="SECTIONS.TASKS"
                    @update:model-value="onUpdateNewError($event)"
                />
            </el-form>
            <template #footer>
                <ValidationError :error="taskError" />
                <el-button :icon="ContentSave" @click="onSaveNewError()" type="primary" :disabled="taskError">
                    {{ $t("save") }}
                </el-button>
            </template>
        </el-drawer>
        <el-drawer
            v-if="isNewTriggerOpen"
            v-model="isNewTriggerOpen"
            title="Add a trigger"
            destroy-on-close
            size=""
            :append-to-body="true"
        >
            <el-form label-position="top">
                <task-editor
                    :section="SECTIONS.TRIGGERS"
                    @update:model-value="onUpdateNewTrigger($event)"
                />
            </el-form>
            <template #footer>
                <ValidationError :error="taskError" />
                <el-button :icon="ContentSave" @click="onSaveNewTrigger()" type="primary" :disabled="taskError">
                    {{ $t("save") }}
                </el-button>
            </template>
        </el-drawer>
        <el-drawer
            v-if="isEditMetadataOpen"
            v-model="isEditMetadataOpen"
            destroy-on-close
            size=""
            :append-to-body="true"
        >
            <template #header>
                <code>flow metadata</code>
            </template>

            <el-form label-position="top">
                <metadata-editor
                    :metadata="getFlowMetadata()"
                    @update:model-value="onUpdateMetadata($event)"
                    :editing="!props.isCreating"
                />
            </el-form>
            <template #footer>
                <el-button
                    :icon="ContentSave"
                    @click="onSaveMetadata()"
                    type="primary"
                    :disabled="!checkRequiredMetadata()"
                    class="edit-flow-save-button"
                >
                    {{ $t("save") }}
                </el-button>
            </template>
        </el-drawer>
        <SwitchView
            v-if="!isReadOnly"
            :type="viewType"
            class="to-topology-button"
            @switch-view="switchView"
        />
    </el-card>
    <bottom-line v-if="!graphOnly">
        <ul>
            <li v-if="(isAllowedEdit || canDelete) && !isReadOnly">
                <el-dropdown>
                    <el-button size="large" type="default">
                        <DotsVertical title="" />
                        {{ t("actions") }}
                    </el-button>
                    <template #dropdown>
                        <el-dropdown-menu class="dropdown-menu">
                            <el-dropdown-item
                                v-if="!props.isCreating && canDelete"
                                class="dropdown-button"
                                :icon="Delete"
                                size="large"
                                @click="deleteFlow"
                            >
                                {{ $t("delete") }}
                            </el-dropdown-item>

                            <el-dropdown-item
                                v-if="!props.isCreating"
                                class="dropdown-button"
                                :icon="ContentCopy"
                                size="large"
                                @click="() => router.push({name: 'flows/create', query: {copy: true}})"
                            >
                                {{ $t("copy") }}
                            </el-dropdown-item>
                            <el-dropdown-item
                                v-if="isAllowedEdit"
                                class="dropdown-button"
                                :icon="Exclamation"
                                size="large"
                                @click="isNewErrorOpen = true;"
                                :disabled="!flowHaveTasks()"
                            >
                                {{ $t("add global error handler") }}
                            </el-dropdown-item>
                            <el-dropdown-item
                                v-if="isAllowedEdit"
                                class="dropdown-button"
                                :icon="LightningBolt"
                                size="large"
                                @click="isNewTriggerOpen = true;"
                                :disabled="!flowHaveTasks()"
                            >
                                {{ $t("add trigger") }}
                            </el-dropdown-item>
                            <el-dropdown-item
                                v-if="isAllowedEdit"
                                class="dropdown-button"
                                :icon="FileEdit"
                                size="large"
                                @click="isEditMetadataOpen = true;"
                            >
                                {{ $t("edit metadata") }}
                            </el-dropdown-item>
                        </el-dropdown-menu>
                    </template>
                </el-dropdown>
            </li>
            <li v-if="flow">
                <trigger-flow
                    v-if="!props.isCreating"
                    type="default"
                    :disabled="flow.disabled"
                    :flow-id="flow.id"
                    :namespace="flow.namespace"
                />
            </li>
            <li>
                <el-button
                    :icon="ContentSave"
                    size="large"
                    @click="save"
                    v-if="isAllowedEdit"
                    :type="flowError ? 'danger' : 'primary'"
                    :disabled="!haveChange"
                    class="edit-flow-save-button"
                >
                    {{ $t("save") }}
                </el-button>
            </li>
        </ul>
    </bottom-line>
</template>

<style lang="scss" scoped>
    .el-card {
        height: calc(100vh - 300px);
        position: relative;

        :deep(.el-card__body) {
            height: 100%;
            display: flex;
        }
    }

    .to-topology-button {
        position: absolute;
        top: 30px;
        right: 45px;
    }

    .editor-combined {
        height: 100%;
        width: 50%;
    }

    .vueflow {
        height: 100%;
        width: 100%;
    }

    html.dark .el-card :deep(.enhance-readability) {
        background-color: var(--bs-gray-500);
    }

    :deep(.combined-right-view), .combined-right-view {
        flex: 1;
        position: relative;
        overflow-y: auto;

        &.enhance-readability {
            padding: calc(var(--spacer) * 1.5);
            background-color: var(--bs-gray-100);
        }

        &::-webkit-scrollbar {
            width: 5px;
        }

        &::-webkit-scrollbar-track {
            -webkit-border-radius: 10px;
        }

        &::-webkit-scrollbar-thumb {
            -webkit-border-radius: 10px;
            background: var(--bs-primary);
        }
    }

    .hide-view {
        width: 0;
    }

    .plugin-doc {
        overflow-x: hidden;
    }

    .dropdown-menu {
        display: flex;
        flex-direction: column;
        width: 20rem;
    }

    .slider {
        flex: 0 0 calc(1rem/3);
        border-radius: 0.25rem;
        margin: 0 0.25rem;
        background-color: var(--bs-secondary);
        border: none;
        cursor: col-resize;
        user-select: none; /* disable selection */
    }
</style>
