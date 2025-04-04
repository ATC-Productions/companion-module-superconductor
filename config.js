export const configFields = [
	{
		type: 'textinput',
		id: 'host',
		label: 'Host',
		width: 6,
		default: '127.0.0.1',
		regex: '^((25[0-5]|2[0-4][0-9]|[0-1]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[0-1]?[0-9][0-9]?)$',
		required: true,
	},
	{
		type: 'textinput',
		id: 'port',
		label: 'Port',
		width: 4,
		default: 5500, // Changed default port to 5500
		regex: '^\d{1,5}$',
		required: true,
	},
	{
		type: 'number',
		id: 'rundownPollInterval',
		label: 'Rundown poll interval (seconds)',
		width: 4,
		min: 10,
		max: 300,
		default: 30, // Changed default port to 5500
		regex: '^\d{1,3}$',
		required: true,
	},
	{
		type: 'number',
		id: 'groupPollInterval',
		label: 'Group poll interval (seconds)',
		min: 1,
		max: 30,
		width: 4,
		default: 5, // Changed default port to 5500
		regex: '^\d{1,2}$',
		required: true,
	},
]
