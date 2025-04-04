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
		this.timelinePoller = [];
		this.subscribedGroups = [];
    }

    async init(config) {
		this.config = this.validateConfig(config);
        await this.updateRundowns();
        this.initActions();
        this.initFeedbacks();
        this.updateStatus(InstanceStatus.Ok);
		this.rundownPoller = setInterval(() => {
            this.updateRundowns();
        }, this.config.rundownPollInterval * 1000);
		this.groupPoller = setInterval(() => {
            this.updateSubscriptions();
        }, this.config.groupPollInterval * 1000); 
    }

    destroy() {
        // No need to close any connections with got.
        // Clear the timers when the instance is destroyed
        if (this.rundownPoller) {
            clearInterval(this.rundownPoller);
            this.rundownPoller = null;
        }
		if (this.groupPoller) {
            clearInterval(this.groupPoller);
            this.groupPoller = null;
        }
    }

	validateConfig(config) {
		if(config.rundownPollInterval < 10 || config.rundownPollInterval > 300) { config.rundownPollInterval = 30;}
		if(config.groupPollInterval < 1 || config.groupPollInterval > 30) { config.groupPollInterval = 10;}
		return config;
	}

    async configUpdated(config) {
        this.config = this.validateConfig(config);
		this.destroy();
		this.rundownPoller = setInterval(() => {
            this.updateRundowns();
        }, this.config.rundownPollInterval * 1000);
		this.groupPoller = setInterval(() => {
            this.updateSubscriptions();
        }, this.config.groupPollInterval * 1000);
        await this.updateRundowns();
        this.initActions();
        this.initFeedbacks();
    }

	updateSubscriptions() {
		//Check if we have subscribedGroups
		if(this.subscribedGroups.length > 0) {
			//Loop through the subscribedGroups filtering for unique groupIds
			const uniqueGroupIds = this.subscribedGroups.map(s => s.groupId).filter((v, i, a) => a.indexOf(v) === i);
			//Log unique groups
			this.log('debug', `Subscribed groups: ${JSON.stringify(uniqueGroupIds)}`);
			//Loop through the unique groupIds
			uniqueGroupIds.forEach(async (fullGroupId) => {
				//Split the groupId into rundownId and groupId
				const [rundownId, groupId] = fullGroupId.split('|||');
				//Call the function to check by ID
				await this.isTimelineObjPlaying(rundownId, groupId);
				//Update any feedbacks that share this groupId
				this.subscribedGroups.forEach(s => {
					if (s.groupId === fullGroupId) {
						this.checkFeedbacksById(s.feedbackid);
					}
				});
			});
		}
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
            this.allGroups = []; // Clear combined group list
            if (this.rundownIds.length > 0) {
                // Fetch groups for all rundowns
                await Promise.all(
                    this.rundownIds.map(async (rundownId) => {
                        this.rundownGroups[rundownId] = await this.updateGroups(rundownId);
                    })
                );
                this.combineGroups(); // Combine groups after fetching
                this.updateActions(); // Update actions after groups are fetched
            } else {
                this.log('warn', 'No rundowns found.');
				this.rundownGroups = {};
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
                this.log('debug', `Fetched groups for rundown ID ${rundownId}: ${JSON.stringify(response.rundown.groups.length)} items`);
				return response.rundown.groups.map((group) => ({
                    id: group.id,
                    label: group.name,
					timelines: group.parts.flatMap(part =>
						part.timeline.map(timeline => timeline.obj?.id).filter(id => id)
					  ),
					playing: null
                }));
            } else {
				this.log('warn', `No groups found for rundown ID ${rundownId}`);
                return [];
            }
        } catch (error) {
            this.log('error', `Error fetching groups for rundown ${rundownId}: ${error}`);
            this.updateStatus(InstanceStatus.ConnectionFailure);
            return [];
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
            'isGroupPlaying': {
                type: 'boolean',
                name: 'Check if group is playing',
                defaultStyle: {
                    bgcolor: this.rgbToDecimal(0, 180, 0),
                    color: this.rgbToDecimal(0, 0, 0),
                },
                options: [
                    {
                        type: 'dropdown',
                        label: 'Group',
                        id: 'groupId',
                        choices: this.allGroups.map((group) => ({ id: group.id, label: group.label })),
                        required: true,
                    },
                ],
                callback: (feedback) => {
					if (feedback.options.groupId == undefined) {
						this.log('debug', `No group selected for isGroupPlaying feedback ${JSON.stringify(this.timelinePoller)}`);
						return false;
					}
                    const [rundownId, groupId] = feedback.options.groupId.split('|||');
					this.log('debug', `Checking playGroup feedback for group ${groupId}: ${JSON.stringify(this.rundownGroups[rundownId].find(g => g.id === groupId))}`);
                    return this.rundownGroups[rundownId].find(g => g.id === groupId).playing;
                },
				subscribe: (feedback) => {
					if (feedback.options.groupId == undefined) {
						this.log('debug', `No group selected for isGroupPlaying feedback`);
						return;
					}
					this.subscribedGroups.push({ groupId: feedback.options.groupId, feedbackid: feedback.id });
					this.log('debug', `Subscribing to playGroup feedback for group ${feedback.options.groupId}`);
					this.updateSubscriptions();
				},
				unsubscribe: (feedback) => {
					if (feedback.options.groupId == undefined) {
						this.log('debug', `No group selected to unsubscribe from feedback`);
						return;
					}
					this.subscribedGroups = this.subscribedGroups.filter(s => s.feedbackid !== feedback.id);
					this.log('debug', `Unsubscribing from playGroup feedback for group ${feedback.options.groupId}`);
					this.updateSubscriptions();
				}
            },
        };
        this.setFeedbackDefinitions(feedbacks);
    }

	async isTimelineObjPlaying(rundownId, groupId) {
		//Check if we have data in this.rundownGroups
		if (!this.rundownGroups[rundownId]) {
			this.log('debug', `No rundown found for ID ${rundownId}`);
			return false;
		}
		
		//call the API to check if the group is playing using the timelines in this.rundownGroups[rundownId][groupId].timelines
		const timelines = this.rundownGroups[rundownId].find(g => g.id === groupId).timelines;
		if (!timelines) {
			this.log('debug', `No timelines found for group ${groupId} in rundown ${rundownId}`);
			return false;
		}
		for (const timeline of timelines) {
			//Query /isTimelineObjPlaying/?rundownId=<rundownId>&timelineObjId=<timelineObjId>
			const response = await this.sendRequest(`/isTimelineObjPlaying/?rundownId=${rundownId}&timelineObjId=${timeline}`, 'POST');
			//If the body of the response is "true" then it's playing, if anything else it's probably not
			if (response == true) {
				this.rundownGroups[rundownId].find(g => g.id === groupId).playing = true;
				this.log('debug', `isTimelineObjPlaying for timeline ${timeline} in group ${groupId} in rundown ${rundownId} is true`);
				return true;
			}
		}
		this.rundownGroups[rundownId].find(g => g.id === groupId).playing = false;
		this.log('debug', `isTimelineObjPlaying for group ${groupId} in rundown ${rundownId} is false`);
		return false;
	}

	rgbToDecimal(r, g, b) {
		return (r << 16) | (g << 8) | b;
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
					{
						feedbackId: 'isGroupPlaying',
						options: {
							groupId: group.id,
						},
						style: {
							// The style property is only valid for 'boolean' feedbacks, and defines the style change it will have.
							color: this.rgbToDecimal(0, 0, 0),
							bgcolor: this.rgbToDecimal(0, 180, 0),
						},
					},
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
