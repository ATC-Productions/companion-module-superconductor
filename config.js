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
]
