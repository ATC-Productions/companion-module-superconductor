import { InstanceBase, runEntrypoint, InstanceStatus } from '@companion-module/base';
import { configFields } from './config.js';
import got from 'got';

class SuperConductorInstance extends InstanceBase {
    constructor(internal) {
        super(internal);
        this.rundownIds = [];
        this.rundownGroups = {}; // Store groups by rundown ID
        this.allGroups = []; // Store combined group list
		this.presets = {};
    }

    async init(config) {
        this.config = config;
        await this.updateRundowns();
        this.initActions();
        this.initFeedbacks();
        this.updateStatus(InstanceStatus.Ok);
		this.pollInterval = setInterval(() => {
            this.updateRundowns();
        }, 30000); // 30000 ms = 30 seconds
    }

    destroy() {
        // No need to close any connections with got.
        // Clear the timer when the instance is destroyed
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    async configUpdated(config) {
        this.config = config;
        await this.updateRundowns();
        this.initActions();
        this.initFeedbacks();
    }

    getConfigFields() {
        return configFields;
    }

    getBaseUrl() {
        const { host, port } = this.config;
        return `http://${host}:${port}/api/internal`;
    }

    async sendRequest(endpoint, method = 'GET', data) {
        const url = `${this.getBaseUrl()}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
        };
        let requestOptions = {
            method,
            headers
        };

        if (data && method !== 'GET') { // only add body if data and not GET
            requestOptions.body = JSON.stringify(data);
        }

        try {
            const response = await got(url, requestOptions);
            try {
                const body = JSON.parse(response.body);
                return body;
            } catch (error) {
                return response.body;
            }
        } catch (error) {
            this.log('error', `Error sending request to ${url}: ${error.message}`);
            this.updateStatus(InstanceStatus.ConnectionFailure, error.message);
            throw error;
        }
    }

    async updateRundowns() {
        try {
            const response = await this.sendRequest('/rundowns', 'GET');
            this.rundownIds = response.rundownIds;
            this.rundownGroups = {}; // Clear stored groups
            this.allGroups = []; // Clear combined group list
            if (this.rundownIds.length > 0) {
                // Fetch groups for all rundowns
                await Promise.all(
                    this.rundownIds.map(async (rundownId) => {
                        await this.updateGroups(rundownId);
                    })
                );
                this.combineGroups(); // Combine groups after fetching
                this.updateActions(); // Update actions after groups are fetched
            } else {
                this.log('warn', 'No rundowns found.');
            }
        } catch (error) {
            this.log('error', `Error fetching rundowns: ${error}`);
            this.updateStatus(InstanceStatus.ConnectionFailure);
            this.rundownIds = [];
        }
    }

    async updateGroups(rundownId) {
        try {
            const response = await this.sendRequest(`/rundown/?rundownId=${rundownId}`, 'GET');
            if (response && response.rundown && response.rundown.groups && Array.isArray(response.rundown.groups)) {
                this.rundownGroups[rundownId] = response.rundown.groups.map((group) => ({
                    id: group.id,
                    label: group.name,
                }));
                this.log('debug', `Fetched groups for rundown ID ${rundownId}: ${JSON.stringify(this.rundownGroups[rundownId])}`);
            } else {
                this.rundownGroups[rundownId] = [];
                this.log('warn', `No groups found for rundown ID ${rundownId}`);
            }
        } catch (error) {
            this.log('error', `Error fetching groups for rundown ${rundownId}: ${error}`);
            this.updateStatus(InstanceStatus.ConnectionFailure);
            this.rundownGroups[rundownId] = [];
        }
    }

    combineGroups() {
      this.allGroups = [];
      this.rundownIds.forEach(rundownId => {
        const rundownName = rundownId.replace(".rundown.json",""); // Remove trailing .rundown.json
          if (this.rundownGroups[rundownId]) {
            this.rundownGroups[rundownId].forEach(group => {
                this.allGroups.push({
                    id: `${rundownId}|||${group.id}`,  // Unique ID: rundownId-groupId
                    label: `${rundownName}/${group.label}`, // e.g., RundownName/GroupName
					groupname: `${group.label}` // e.g., RundownName/GroupName
                });
            });
			this.initPresets();
          }
      });
    }

    initActions() {
        this.updateActions();
    }

    updateActions() {
        const actions = {
            'playGroup': {
                name: 'Play Group',
                options: [
                    {
                        type: 'dropdown',
                        label: 'Group',
                        id: 'groupId',
                        choices: this.allGroups.map((group) => ({ id: group.id, label: group.label })),
                        required: true,
                    },
                ],
                callback: async (action) => {
                    try {
                        const [rundownId, groupId] = action.options.groupId.split('|||'); // Extract rundownId and groupId
                        await this.sendRequest(`/playGroup/?rundownId=${rundownId}&groupId=${groupId}`, 'POST');
                    } catch (error) {
                        this.log('error', `Play Group Action Failed: ${error}`);
                    }
                },
            },
            'stopGroup': {
                name: 'Stop Group',
                options: [
                    {
                        type: 'dropdown',
                        label: 'Group',
                        id: 'groupId',
                        choices: this.allGroups.map((group) => ({ id: group.id, label: group.label })),
                        required: true,
                    },
                ],
                callback: async (action) => {
                    try {
                        const [rundownId, groupId] = action.options.groupId.split('|||'); // Extract rundownId and groupId

                        await this.sendRequest(`/stopGroup/?rundownId=${rundownId}&groupId=${groupId}`, 'POST');
                    } catch (error) {
                        this.log('error', `Stop Group Action Failed: ${error}`);
                    }
                },
            },
			'pauseGroup': {
                name: 'Pause Group',
                options: [
                    {
                        type: 'dropdown',
                        label: 'Group',
                        id: 'groupId',
                        choices: this.allGroups.map((group) => ({ id: group.id, label: group.label })),
                        required: true,
                    },
                ],
                callback: async (action) => {
                    try {
                        const [rundownId, groupId] = action.options.groupId.split('|||'); // Extract rundownId and groupId

                        await this.sendRequest(`/pauseGroup/?rundownId=${rundownId}&groupId=${groupId}`, 'POST');
                    } catch (error) {
                        this.log('error', `Pause Group Action Failed: ${error}`);
                    }
                },
            },
        };
        this.setActionDefinitions(actions);
    }

    initFeedbacks() {
        const feedbacks = {
            // Add feedbacks here as needed.
        };
        this.setFeedbackDefinitions(feedbacks);
    }

	initPresets() {
        this.presets = {};
        this.allGroups.forEach((group) => {
            const [rundownId, groupId] = group.id.split('|||');
            const rundownName = rundownId.replace(".rundown.json", "");
            this.presets[group.id] = {
                type: 'button', // This must be 'button' for now
                category: rundownName, // This groups presets into categories in the ui.
                name: group.groupname, // A name for the preset.
                style: {
                    // This is the minimal set of style properties you must define
                    text: group.groupname, // You can use variables from your module here
                    size: 'auto',
                    color: 16777215,
                    bgcolor: 0,
                },
                steps: [
                    {
                        down: [
                            {
                                // add an action on down press
                                actionId: 'playGroup',
                                options: {
                                    // options values to use
                                    groupId: group.id,
                                },
                            },
                        ],
                        up: [],
                    },
					{
                        down: [
                            {
                                // add an action on down press
                                actionId: 'stopGroup',
                                options: {
                                    // options values to use
                                    groupId: group.id,
                                },
                            },
                        ],
                        up: [],
                    },
                ],
                feedbacks: [
					
				], // You can add some presets from your module here
            };
        });
        this.setPresetDefinitions(this.presets);
    }

    updateStatus(status, message) {
        super.updateStatus(status, message);
    }

}

runEntrypoint(SuperConductorInstance, []);
