# Bitfocus Companion Module: SuperConductor for CasparCG

This is a **Bitfocus Companion** module for controlling SuperFlyTV's **SuperConductor** for CasparCG. The module currently supports basic operations such as:

- Playing, pausing, and stopping groups across multiple rundowns.
- Basic preset functionality for quick workflow optimization.
- Feedback for determining whether a group is currently playing.

Please note: the API used by this module is an **internal, limited, and unstable HTTP API**. While it has been available since the last release of SuperConductor in 2024, it may undergo changes that could impact this module's functionality.

## Polling Intervals

The module config allows setting two different polling intervals; one for checking the status of rundowns and another for checking the status of groups.  The rundowns poller is responsible for periodically checking your rundowns for new groups to fill the drop-down lists on actions and feedbacks.  You shouldn't need this set very high, but it is recommended to be above 10 seconds.

The groups poller is responsible for checking the status of groups to determine if they are playing or paused.  This is one you need to check more often depending on how quickly you'd like Companion to be able to see changes in playback status.  Note that it's one API call for every group you're monitoring (but we only check once per group, no matter how many buttons are interested) so you don't want this to get out of control.  You can set it as low as one second if you're game.

The default values are 30 seconds for rundowns and 10 seconds for groups

---

## Screenshots

![Screenshot](/docs/screenshot-action-playgroup.png)

![Screenshot](/docs/screenshot-connection-setup.png)

---

## Important Notice
This project is my **first-time development of a Companion module** and my first experience working with **JavaScript**. Therefore, it is unlikely to adhere to best practices or advanced programming paradigms. Contributions and constructive feedback from other developers are highly welcome to help improve this module's functionality and code quality.

---

## Getting Started: Testing the Module Locally

To test this module locally on your Bitfocus Companion instance, follow these steps:

### Prerequisites
1. Follow the [official guide](https://github.com/bitfocus/companion-module-base/wiki) to set up a development environment.
2. Clone this repository to your local system.