// settings.ts
import { App, PluginSettingTab, Setting } from "obsidian";
import FloatingNumberPlugin from "./main";

// Interfaces
export interface FloatingNumberSettings {
	boxes: {
		[id: string]: BoxSettings;
	};
}

export interface BoxSettings {
	position: { x: number; y: number };
	zIndex: number;
	// Styling
	backgroundColor: string;
	customBackgroundColor: string;
	textColor: string;
	customTextColor: string;
	fontSize: number;
	padding: number;
	// Data
	dataType: "completedTasks" | "uncompletedTasks" | "wordCount" | "dataview";
	dataviewField: string;
	noDataMessage: string;
	isBold: boolean;
}

// Default Settings
export const DEFAULT_SETTINGS: FloatingNumberSettings = {
	boxes: {
		default: {
			position: { x: 20, y: 50 },
			backgroundColor: "default",
			customBackgroundColor: "",
			textColor: "default",
			customTextColor: "",
			fontSize: 16,
			padding: 20,
			dataType: "dataview",
			dataviewField: "todayNumber",
			noDataMessage: "N/A",
			isBold: false,
			zIndex: 100,
		},
	},
};

// Settings Tab UI
export class FloatingNumberSettingTab extends PluginSettingTab {
	plugin: FloatingNumberPlugin;

	constructor(app: App, plugin: FloatingNumberPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Add button to create new floating box
		new Setting(containerEl)
			.setName("Add New Box")
			.setDesc("Create a new floating number box")
			.addButton((button) =>
				button.setButtonText("Add Box").onClick(async () => {
					await this.plugin.manager.createBox(
						DEFAULT_SETTINGS.boxes.default
					);
					await this.plugin.saveSettings();
					this.display();
				})
			);

		containerEl.createEl("h3", { text: "Floating Boxes" });

		// Display settings for each box
		Object.entries(this.plugin.settings.boxes).forEach(
			([boxId, boxSettings]) => {
				const boxDiv = containerEl.createDiv();
				boxDiv.createEl("h4", { text: `Box ${boxId}` });

				new Setting(boxDiv)
					.setName("Data Type")
					.setDesc("Choose what type of data to display")
					.addDropdown((dropdown) =>
						dropdown
							.addOptions({
								completedTasks: "Completed Tasks",
								uncompletedTasks: "Uncompleted Tasks",
								wordCount: "Word Count",
								dataview: "Dataview Field",
							})
							.setValue(boxSettings.dataType)
							.onChange(
								async (value: BoxSettings["dataType"]) => {
									boxSettings.dataType = value;
									await this.plugin.manager.updateOneBoxSettings(
										boxId,
										boxSettings
									);
									this.display();
								}
							)
					);

				if (boxSettings.dataType === "dataview") {
					new Setting(boxDiv)
						.setName("Dataview Field")
						.setDesc(
							"The dataview field to display from today's daily note"
						)
						.addText((text) =>
							text
								.setPlaceholder("e.g., todayNumber")
								.setValue(boxSettings.dataviewField)
								.onChange(async (value) => {
									boxSettings.dataviewField = value;
									await this.plugin.manager.updateOneBoxSettings(
										boxId,
										boxSettings
									);
								})
						);
				}

				new Setting(boxDiv)
					.setName("No Data Message")
					.setDesc("Message to display when no data is found")
					.addText((text) =>
						text
							.setPlaceholder("N/A")
							.setValue(boxSettings.noDataMessage)
							.onChange(async (value) => {
								boxSettings.noDataMessage = value;
								await this.plugin.manager.updateOneBoxSettings(
									boxId,
									boxSettings
								);
							})
					);

				boxDiv.createEl("h5", { text: "Appearance" });

				new Setting(boxDiv)
					.setName("Background Color")
					.addDropdown((dropdown) =>
						dropdown
							.addOptions({
								default: "Default",
								secondary: "Secondary",
								tertiary: "Tertiary",
								custom: "Custom",
							})
							.setValue(boxSettings.backgroundColor)
							.onChange(async (value) => {
								boxSettings.backgroundColor = value;
								if (value === "custom") {
									boxSettings.customBackgroundColor =
										"#ffffff";
								}
								await this.plugin.manager.updateOneBoxSettings(
									boxId,
									boxSettings
								);
								this.display();
							})
					);

				if (boxSettings.backgroundColor === "custom") {
					new Setting(boxDiv)
						.setName("Custom Background Color")
						.addText((text) =>
							text
								.setValue(boxSettings.customBackgroundColor)
								.onChange(async (value) => {
									boxSettings.customBackgroundColor = value;
									await this.plugin.manager.updateOneBoxSettings(
										boxId,
										boxSettings
									);
								})
						)
						.addColorPicker((color) =>
							color
								.setValue(boxSettings.customBackgroundColor)
								.onChange(async (value) => {
									boxSettings.customBackgroundColor = value;
									await this.plugin.manager.updateOneBoxSettings(
										boxId,
										boxSettings
									);
								})
						);
				}

				new Setting(boxDiv)
					.setName("Text Color")
					.addDropdown((dropdown) =>
						dropdown
							.addOptions({
								default: "Default",
								muted: "Muted",
								faint: "Faint",
								custom: "Custom",
							})
							.setValue(boxSettings.textColor)
							.onChange(async (value) => {
								boxSettings.textColor = value;
								if (value === "custom") {
									boxSettings.customTextColor = "#000000";
								}
								await this.plugin.manager.updateOneBoxSettings(
									boxId,
									boxSettings
								);
								this.display();
							})
					);

				if (boxSettings.textColor === "custom") {
					new Setting(boxDiv)
						.setName("Custom Text Color")
						.addText((text) =>
							text
								.setValue(boxSettings.customTextColor)
								.onChange(async (value) => {
									boxSettings.customTextColor = value;
									await this.plugin.manager.updateOneBoxSettings(
										boxId,
										boxSettings
									);
								})
						)
						.addColorPicker((color) =>
							color
								.setValue(boxSettings.customTextColor)
								.onChange(async (value) => {
									boxSettings.customTextColor = value;
									await this.plugin.manager.updateOneBoxSettings(
										boxId,
										boxSettings
									);
								})
						);
				}

				new Setting(boxDiv)
					.setName("Bold Text")
					.setDesc("Make the displayed number bold")
					.addToggle((toggle) =>
						toggle
							.setValue(boxSettings.isBold)
							.onChange(async (value) => {
								boxSettings.isBold = value;
								await this.plugin.manager.updateOneBoxSettings(
									boxId,
									boxSettings
								);
							})
					);

				new Setting(boxDiv)
					.setName("Padding")
					.setDesc("Set the padding for the floating box")
					.addSlider((slider) =>
						slider
							.setLimits(0, 64, 1)
							.setValue(boxSettings.padding)
							.setDynamicTooltip()
							.onChange(async (value) => {
								boxSettings.padding = value;
								await this.plugin.manager.updateOneBoxSettings(
									boxId,
									boxSettings
								);
							})
					);

				// Add delete button at the bottom of each box's settings
				new Setting(boxDiv)
					.setName("Delete Box")
					.setDesc("Remove this floating box")
					.addButton((button) =>
						button
							.setButtonText("Delete")
							.setWarning()
							.onClick(async () => {
								this.plugin.manager.removeBox(boxId);
								await this.plugin.manager.updateOneBoxSettings(
									boxId,
									boxSettings
								);
								this.display();
							})
					);

				// Add separator between boxes
				boxDiv.createEl("hr");
			}
		);
	}
}
