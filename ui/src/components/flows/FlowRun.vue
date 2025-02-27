<template>
    <div class="container" v-if="flow">
        <el-alert v-if="flow.disabled" type="warning" show-icon :closable="false">
            <strong>{{ $t('disabled flow title') }}</strong><br>
            {{ $t('disabled flow desc') }}
        </el-alert>
        <el-form label-position="top" :model="inputs" ref="form">
            <el-form-item
                v-for="input in flow.inputs || []"
                :key="input.id"
                :label="input.name"
                :required="input.required !== false"
                :prop="input.name"
            >
                <editor
                    :full-height="false"
                    :input="true"
                    :navbar="false"
                    v-if="input.type === 'STRING' || input.type === 'URI'"
                    v-model="inputs[input.name]"
                />
                <el-input-number
                    v-if="input.type === 'INT'"
                    v-model="inputs[input.name]"
                    :step="1"
                />
                <el-input-number
                    v-if="input.type === 'FLOAT'"
                    v-model="inputs[input.name]"
                    :step="0.001"
                />
                <el-checkbox
                    v-if="input.type === 'BOOLEAN'"
                    v-model="inputs[input.name]"
                    value="true"
                    unchecked-value="false"
                />
                <el-date-picker
                    v-if="input.type === 'DATETIME'"
                    v-model="inputs[input.name]"
                    type="datetime"
                />
                <el-date-picker
                    v-if="input.type === 'DATE'"
                    v-model="inputs[input.name]"
                    type="date"
                />
                <el-time-picker
                    v-if="input.type === 'TIME' || input.type === 'DURATION'"
                    v-model="inputs[input.name]"
                    type="time"
                />
                <div class="el-input el-input-file">
                    <div class="el-input__wrapper" v-if="input.type === 'FILE'">
                        <input
                            :id="input.name+'-file'"
                            class="el-input__inner"
                            type="file"
                            @change="onFileChange(input, $event)"
                            autocomplete="off"
                            :style="{display: typeof(inputs[input.name]) === 'string' && inputs[input.name].startsWith('kestra:///') ? 'none': ''}"
                        >
                        <label v-if="typeof(inputs[input.name]) === 'string' && inputs[input.name].startsWith('kestra:///')"
                               :for="input.name+'-file'">Kestra Internal Storage File</label>
                    </div>
                </div>
                <editor
                    :full-height="false"
                    :input="true"
                    :navbar="false"
                    v-if="input.type === 'JSON'"
                    lang="json"
                    v-model="inputs[input.name]"
                />

                <small v-if="input.description" class="text-muted">{{ input.description }}</small>
            </el-form-item>
            <div class="bottom-buttons">
                <div class="left-align">
                    <el-form-item>
                        <el-button v-if="execution && execution.inputs" :icon="ContentCopy" @click="fillInputsFromExecution">
                            {{ $t('prefill inputs') }}
                        </el-button>
                    </el-form-item>
                </div>
                <div class="right-align">
                    <el-form-item class="submit">
                        <el-button :icon="Flash" class="flow-run-trigger-button" @click="onSubmit($refs.form)" type="primary" :disabled="flow.disabled">
                            {{ $t('launch execution') }}
                        </el-button>
                    </el-form-item>
                </div>
            </div>
        </el-form>
    </div>
</template>

<script setup>
    import ContentCopy from "vue-material-design-icons/ContentCopy.vue";
    import Flash from "vue-material-design-icons/Flash.vue";
</script>

<script>
    import {mapState} from "vuex";
    import {executeTask} from "../../utils/submitTask"
    import Editor from "../../components/inputs/Editor.vue";
    import {pageFromRoute} from "../../utils/eventsRouter";

    export default {
        components: {Editor},
        props: {
            redirect: {
                type: Boolean,
                default: true
            }
        },
        data() {
            return {
                inputs: {}
            };
        },
        emits: ["executionTrigger"],
        created() {
            for (const input of this.flow.inputs || []) {
                this.inputs[input.name] = input.defaults;

                if(input.type === "BOOLEAN" && input.defaults){
                    this.inputs[input.name] = (/true/i).test(input.defaults);
                }
            }
        },
        mounted() {
            setTimeout(() => {
                const input = this.$el && this.$el.querySelector && this.$el.querySelector("input")
                if (input && !input.className.includes("mx-input")) {
                    input.focus()
                }
            }, 500)

            this._keyListener = function(e) {
                if (e.keyCode === 13 && (e.ctrlKey || e.metaKey))  {
                    e.preventDefault();
                    this.onSubmit(this.$refs.form);
                }
            };

            document.addEventListener("keydown", this._keyListener.bind(this));
        },
        beforeUnmount() {
            document.removeEventListener("keydown", this._keyListener);
        },
        computed: {
            ...mapState("flow", ["flow"]),
            ...mapState("core", ["guidedProperties"]),
            ...mapState("execution", ["execution"]),
        },
        methods: {
            fillInputsFromExecution(){
                const nonEmptyInputNames = Object.keys(this.execution.inputs);
                this.inputs = Object.fromEntries(
                    this.flow.inputs.filter(input => nonEmptyInputNames.includes(input.name))
                        .map(input => {
                            const inputName = input.name;
                            const inputType = input.type;
                            let inputValue = this.execution.inputs[inputName];
                            if (inputType === 'DATE' || inputType === 'DATETIME') {
                                inputValue = this.$moment(inputValue).toISOString()
                            }else if (inputType === 'DURATION' || inputType === 'TIME') {
                                inputValue = this.$moment().startOf("day").add(inputValue, "seconds").toString()
                            }else if (inputType === 'JSON') {
                                inputValue = JSON.stringify(inputValue).toString()
                            }

                            return [inputName, inputValue]
                        })
                );
            },
            onSubmit(formRef) {
                if (this.$tours["guidedTour"].isRunning.value) {
                    this.finishTour();
                }
                if (formRef) {
                    formRef.validate((valid) => {
                        if (!valid) {
                            return false;
                        }

                        executeTask(this, this.flow, this.inputs, {
                            redirect: this.redirect,
                            id: this.flow.id,
                            namespace: this.flow.namespace
                        })
                        this.$emit("executionTrigger");
                    });
                }
            },
            finishTour() {
                this.$store.dispatch("api/events", {
                    type: "ONBOARDING",
                    onboarding: {
                        step: this.$tours["guidedTour"].currentStep._value,
                        action: "execute",
                    },
                    page: pageFromRoute(this.$router.currentRoute.value)
                });

                this.$store.dispatch("api/events", {
                    type: "ONBOARDING",
                    onboarding: {
                        step: this.$tours["guidedTour"].currentStep._value,
                        action: "finish",
                    },
                    page: pageFromRoute(this.$router.currentRoute.value)
                });

                localStorage.setItem("tourDoneOrSkip", "true");

                this.$store.commit("core/setGuidedProperties", {
                    tourStarted: false,
                    flowSource: undefined,
                    saveFlow: false,
                    executeFlow: false,
                    validateInputs: false,
                    monacoRange: undefined,
                    monacoDisableRange: undefined
                });

                return this.$tours["guidedTour"].finish();
            },
            onFileChange(input, e) {
                if (!e.target) {
                    return;
                }

                const files = e.target.files || e.dataTransfer.files;
                if (!files.length) {
                    return;
                }
                this.inputs[input.name] = e.target.files[0];
            },
            state(input) {
                const required = input.required === undefined ? true : input.required;

                if (!required && input.value === undefined) {
                    return null;
                }

                if (required && input.value === undefined) {
                    return false;
                }

                return true;
            }
        },
        watch: {
            guidedProperties: {
                handler() {
                    if (this.guidedProperties.validateInputs) {
                        this.onSubmit(this.$refs.form);
                    }
                },
                deep: true
            }
        }
    };
</script>

<style scoped lang="scss">
.bottom-buttons {
    margin-top: 36px;
    display: flex;

    > * {
        flex: 1;

        * {
            margin: 0;
        }
    }

    .left-align :deep(div) {
        flex-direction: row
    }

    .right-align :deep(div) {
        flex-direction: row-reverse;
    }
}
</style>