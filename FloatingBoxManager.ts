// FloatingBoxManager.ts
import { FloatingBox } from "./FloatingBox";
import FloatingNumberPlugin from "./main";
import { BoxSettings } from "./settings";

interface BoxRegistry {
	[id: string]: FloatingBox;
}

export class FloatingBoxManager {
	private boxes: BoxRegistry = {};
	private plugin: FloatingNumberPlugin;

	constructor(plugin: FloatingNumberPlugin) {
		this.plugin = plugin;
	}

	generateUniqueId(): string {
		return "box_" + Date.now().toString();
	}

	async createBox(settings: BoxSettings): Promise<string> {
		const id = this.generateUniqueId();
		// Find the lowest current zIndex
		const lowestZIndex = Object.values(this.boxes).reduce(
			(min, box) => Math.min(min, box.getSettings().zIndex),
			100
		);

		const newSettings = {
			...settings,
			zIndex: lowestZIndex - 1,
		};

		settings.zIndex = lowestZIndex - 1;
		const box = new FloatingBox(this, id, newSettings);
		this.boxes[id] = box;
		await this.saveAllBoxesSettingsToPluginSettings();
		return id;
	}

	removeBox(id: string) {
		if (this.boxes[id]) {
			this.boxes[id].destroy();
			delete this.boxes[id];
			this.saveAllBoxesSettingsToPluginSettings();
		}
	}

	async saveAllBoxesSettingsToPluginSettings() {
		const boxSettings: { [id: string]: BoxSettings } = {};

		// Collect settings from all boxes
		Object.entries(this.boxes).forEach(([id, box]) => {
			boxSettings[id] = box.getSettings();
		});

		// Save to plugin settings
		this.plugin.settings.boxes = boxSettings;
		await this.plugin.saveData(this.plugin.settings);
	}

	async updateOneBoxSettings(
		boxId: string,
		newSettings: Partial<BoxSettings>
	) {
		const box = this.boxes[boxId];
		if (box) {
			box.updateSettings(newSettings);
			await this.saveAllBoxesSettingsToPluginSettings();
		}
	}

	async loadBoxes() {
		// Create boxes from saved settings
		Object.entries(this.plugin.settings.boxes).forEach(
			([id, boxSettings]) => {
				const box = new FloatingBox(this, id, boxSettings);
				this.boxes[id] = box;
			}
		);
	}

	// Data fetching for boxes
	async getTodayNumber(settings: BoxSettings): Promise<string> {
		const dailyNote = this.plugin.getTodayDailyNote.call(this.plugin);
		if (!dailyNote) return "N/A";

		const content = await this.plugin.app.vault.read(dailyNote);

		switch (settings.dataType) {
			case "completedTasks":
				return this.countCompletedTasks(content).toString();
			case "uncompletedTasks":
				return this.countUncompletedTasks(content).toString();
			case "wordCount":
				return this.countWords(content).toString();
			case "dataview": {
				const match = content.match(
					new RegExp(`${settings.dataviewField}:: (.+)`)
				);
				return match ? match[1].trim() : settings.noDataMessage;
			}
			default:
				return settings.noDataMessage;
		}
	}

	private countCompletedTasks(content: string): number {
		const completedTasks = content.match(/- \[x\] .+/g) || [];
		return completedTasks.length;
	}

	private countUncompletedTasks(content: string): number {
		const uncompletedTasks = content.match(/- \[ \] .+/g) || [];
		return uncompletedTasks.length;
	}

	private countWords(content: string): number {
		return content.split(/\s+/).filter((word) => word.length > 0).length;
	}

	updateAllBoxes() {
		Object.values(this.boxes).forEach((box) => {
			box.updateContent();
		});
	}

	destroyAllBoxes() {
		Object.values(this.boxes).forEach((box) => {
			box.destroy();
		});
		this.boxes = {};
	}
}
