import { App, Plugin, TFile, moment } from "obsidian";

import {
	FloatingNumberSettings,
	DEFAULT_SETTINGS,
	FloatingNumberSettingTab,
} from "./settings";

import { FloatingBoxManager } from "./FloatingBoxManager";

export default class FloatingNumberPlugin extends Plugin {
	settings: FloatingNumberSettings;
	manager: FloatingBoxManager;

	async onload() {
		await this.loadSettings();

		// Initialize manager
		this.manager = new FloatingBoxManager(this);
		await this.manager.loadBoxes();

		// Add setting tab
		this.addSettingTab(new FloatingNumberSettingTab(this.app, this));

		// Update content when files change
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.manager.updateAllBoxes();
				}
			})
		);
	}

	onunload() {
		this.manager.destroyAllBoxes();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Helper method used by manager
	getTodayDailyNote(): TFile | null {
		const dailyNotePlugin = (this.app as any).internalPlugins.plugins[
			"daily-notes"
		];
		if (!dailyNotePlugin?.enabled) return null;

		const format =
			dailyNotePlugin.instance?.options?.format || "YYYY-MM-DD";
		const folder = dailyNotePlugin.instance?.options?.folder || "";
		const fileName = `${folder ? folder + "/" : ""}${moment().format(
			format
		)}.md`;

		return this.app.vault.getAbstractFileByPath(fileName) as TFile;
	}
}
