export default {
    namespaced: true,
    state: {
        executions: undefined,
        execution: undefined,
        taskRun: undefined,
        task: undefined,
        total: 0,
        logs: [],
        metrics: [],
        metricsTotal: 0,
    },
    actions: {
        loadExecutions({commit}, options) {
            return this.$http.get("/api/v1/executions", {params: options}).then(response => {
                commit("setExecutions", response.data.results)
                commit("setTotal", response.data.total)
            })
        },
        restartExecution(_, options) {
            return this.$http.post(
                `/api/v1/executions/${options.executionId}/restart`,
                null,
                {
                    params: {
                        revision: options.revision
                    }
                })
        },
        bulkRestartExecution(_, options) {
            return this.$http.post(
                "/api/v1/executions/restart/by-ids",
                options.executionsId
            )
        },
        queryRestartExecution(_, options) {
            return this.$http.post(
                "/api/v1/executions/restart/by-query",
                {},
                {params: options}
            )
        },
        replayExecution(_, options) {
            return this.$http.post(
                `/api/v1/executions/${options.executionId}/replay`,
                null,
                {
                    params: {
                        taskRunId: options.taskRunId,
                        revision: options.revision
                    }
                })
        },
        changeStatus(_, options) {
            return this.$http.post(
                `/api/v1/executions/${options.executionId}/state`,
                {
                    taskRunId: options.taskRunId,
                    state: options.state,
                })
        },
        kill(_, options) {
            return this.$http.delete(`/api/v1/executions/${options.id}/kill`);
        },
        bulkKill(_, options) {
            return this.$http.delete("/api/v1/executions/kill/by-ids", {data: options.executionsId});
        },
        queryKill(_, options) {
            return this.$http.delete("/api/v1/executions/kill/by-query", {params: options});
        },
        loadExecution({commit}, options) {
            return this.$http.get(`/api/v1/executions/${options.id}`).then(response => {
                commit("setExecution", response.data)

                return response.data;
            })
        },
        findExecutions({commit}, options) {
            return this.$http.get("/api/v1/executions/search", {params: options}).then(response => {
                commit("setExecutions", response.data.results)
                commit("setTotal", response.data.total)

                return response.data
            })
        },
        triggerExecution(_, options) {
            return this.$http.post(`/api/v1/executions/trigger/${options.namespace}/${options.id}`, options.formData, {
                timeout: 60 * 60 * 1000,
                headers: {
                    "content-type": "multipart/form-data"
                }
            })
        },
        deleteExecution({commit}, options) {
            return this.$http.delete(`/api/v1/executions/${options.id}`).then(() => {
                commit("setExecution", null)
            })
        },
        bulkDeleteExecution({commit}, options) {
            return this.$http.delete("/api/v1/executions/by-ids", {data: options.executionsId})
        },
        queryDeleteExecution({commit}, options) {
            return this.$http.delete("/api/v1/executions/by-query", {params: options})
        },
        followExecution(_, options) {
            return new EventSource(`${this.$http.defaults.baseURL}api/v1/executions/${options.id}/follow`);
        },
        followLogs(_, options) {
            return new EventSource(`${this.$http.defaults.baseURL}api/v1/logs/${options.id}/follow`);
        },
        loadLogs({commit}, options) {
            return this.$http.get(`/api/v1/logs/${options.executionId}`, {
                params: options.params
            }).then(response => {
                commit("setLogs", response.data)
            })
        },
        loadMetrics({commit}, options) {
            return this.$http.get(`/api/v1/metrics/${options.executionId}`, {
                params: options.params
            }).then(response => {
                commit("setMetrics", response.data.results)
                commit("setMetricsTotal", response.data.total)
            })
        }
    },
    mutations: {
        setExecutions(state, executions) {
            state.executions = executions
        },
        setExecution(state, execution) {
            state.execution = execution
        },
        setTask(state, task) {
            state.task = task
        },
        setTaskRun(state, taskRun) {
            state.taskRun = taskRun
        },
        setTotal(state, total) {
            state.total = total
        },
        setLogs(state, logs) {
            state.logs = logs
        },
        setMetrics(state, metrics) {
            state.metrics = metrics
        },
        setMetricsTotal(state, metrics) {
            state.metricsTotal = metrics
        },
        appendLogs(state, logs) {
            state.logs.push(logs);
        }
    },
    getters: {
        execution(state) {
            if (state.execution) {
                return state.execution;
            }
        },
    }
}
