<template>
    <div>
        <span v-for="trigger in triggers" :key="uid(trigger)" :id="uid(trigger)">
            <template v-if="trigger.disabled === undefined || trigger.disabled === false">
                <el-popover
                    placement="left"
                    :persistent="false"
                    :title="`${$t('trigger details')}: ${trigger ? trigger.id : ''}`"
                    width=""
                    transition=""
                    :hide-after="0"
                >
                    <template #reference>
                        <el-avatar shape="square" class="me-1" size="small" button>
                            {{ name(trigger) }}
                        </el-avatar>
                    </template>
                    <template #default>
                        <vars :data="triggerData(trigger)" />
                    </template>
                </el-popover>
            </template>
        </span>
    </div>
</template>
<script>
    import Markdown from "../../utils/markdown";
    import Vars from "../executions/Vars.vue";

    export default {
        props: {
            flow: {
                type: Object,
                default: () => undefined,
            },
            execution: {
                type: Object,
                default: () => undefined,
            },
        },
        components: {
            Vars
        },
        methods: {
            uid(trigger) {
                return (this.flow ? this.flow.namespace + "-" + this.flow.id : this.execution.id) + "-" + trigger.id
            },
            name(trigger) {
                let split = trigger.type.split(".");

                return split[split.length - 1].substr(0, 1).toUpperCase();
            },
            triggerData(trigger) {
                if (trigger.description) {
                    return {...trigger, description: Markdown.render(trigger.description)}
                }

                return trigger
            },
        },
        computed: {
            triggers() {
                if (this.flow && this.flow.triggers) {
                    return this.flow.triggers
                } else if (this.execution && this.execution.trigger) {
                    return [this.execution.trigger]
                } else {
                    return []
                }

            }
        }
    };
</script>
