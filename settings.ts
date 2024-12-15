// settings.ts
import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import FloatingNumberPlugin from "./main";

// Interfaces
export interface FloatingNumberSettings {
	boxes: {
		[id: string]: BoxSettings;
	};
	dailyNoteEndTime: string;
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
	dataType:
		| "completedTasks"
		| "uncompletedTasks"
		| "wordCount"
		| "characterCount"
		| "sentenceCount"
		| "pageCount"
		| "dataview"
		| "customjs";
	pageWordsPerPage: number;
	dataviewField: string;
	noDataMessage: string;
	isBold: boolean;
	useDailyNote: boolean;
	customNotePath: string;
	customScript: string;
}

// Default Settings
export const DEFAULT_SETTINGS: FloatingNumberSettings = {
	boxes: {
		default: {
			position: { x: 100, y: 100 },
			backgroundColor: "default",
			customBackgroundColor: "",
			textColor: "default",
			customTextColor: "",
			fontSize: 16,
			padding: 8,
			dataType: "completedTasks",
			dataviewField: "",
			noDataMessage: "N/A",
			isBold: true,
			zIndex: 100,
			pageWordsPerPage: 250,
			useDailyNote: true,
			customNotePath: "",
			customScript: "",
		},
	},
	dailyNoteEndTime: "04:00",
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
			.setDesc("Create a new floating datapoint 🤩")
			.addButton((button) =>
				button
					.setButtonText("➡️ Add Floating Datapoint ⬅️")
					.onClick(async () => {
						await this.plugin.manager.createBox(
							DEFAULT_SETTINGS.boxes.default
						);
						this.display();
					})
			);
		containerEl.createEl("br");
		containerEl.createEl("h2", { text: "Your Floating Datapoints" });

		// Display settings for each box
		Object.entries(this.plugin.settings.boxes).forEach(
			([boxId, boxSettings]) => {
				const boxDiv = containerEl.createDiv();
				boxDiv.createEl("h3", {
					text: `Datapoint ${100 - boxSettings.zIndex}`,
				});
				new Setting(boxDiv)
					.setName("Use Daily Note")
					.addToggle((toggle) =>
						toggle
							.setValue(boxSettings.useDailyNote)
							.setTooltip(
								"Toggle between daily note and custom note path"
							)
							.onChange(async (value) => {
								boxSettings.useDailyNote = value;
								await this.plugin.manager.updateOneBoxSettings(
									boxId,
									boxSettings
								);
								this.display();
							})
					);

				if (!boxSettings.useDailyNote) {
					new Setting(boxDiv)
						.setName("Custom Note Path")
						.setDesc(
							"Path to the note to pull data from (e.g., folder/note)"
						)
						.addText((text) =>
							text
								.setPlaceholder("folder/note")
								.setValue(boxSettings.customNotePath)
								.onChange(async (value) => {
									boxSettings.customNotePath = value;
									await this.plugin.manager.updateOneBoxSettings(
										boxId,
										boxSettings
									);
								})
						);
				}
				boxDiv.createEl("br");
				new Setting(boxDiv)
					.setName("Data Type")
					.addDropdown((dropdown) =>
						dropdown
							.addOptions({
								completedTasks: "Completed Tasks",
								uncompletedTasks: "Uncompleted Tasks",
								wordCount: "Word Count",
								characterCount: "Character Count",
								sentenceCount: "Sentence Count",
								pageCount: "Page Count",
								dataview: "Dataview Field",
								customjs: "Custom JavaScript",
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
				if (boxSettings.dataType === "pageCount") {
					new Setting(boxDiv)
						.setName("Words per Page")
						.setDesc("Number of words that constitute one page")
						.addText((text) =>
							text
								.setPlaceholder("275")
								.setValue(
									boxSettings.pageWordsPerPage.toString()
								)
								.onChange(async (value) => {
									const numValue = parseInt(value) || 275;
									boxSettings.pageWordsPerPage = numValue;
									await this.plugin.manager.updateOneBoxSettings(
										boxId,
										boxSettings
									);
								})
						);
				}
				if (boxSettings.dataType === "dataview") {
					new Setting(boxDiv)
						.setName("Dataview Field")
						.addText((text) =>
							text
								.setPlaceholder("ex: MeditationMinutes")
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
				if (boxSettings.dataType === "customjs") {
					new Setting(boxDiv)
						.setName("Custom Script")
						.addTextArea((text) =>
							text
								.setPlaceholder("Insert your script here 😌")
								.setValue(boxSettings.customScript)
								.onChange(async (value) => {
									boxSettings.customScript = value;
									await this.plugin.manager.updateOneBoxSettings(
										boxId,
										boxSettings
									);
								})
						);
				}
				boxDiv.createEl("br");
				new Setting(boxDiv).setName("No Data Message").addText((text) =>
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

				boxDiv.createEl("h4", { text: "Appearance" });

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
								const updates: Partial<BoxSettings> = {
									backgroundColor: value,
								};
								if (value === "custom") {
									updates.customBackgroundColor = "#ffffff";
								}
								await this.plugin.manager.updateOneBoxSettings(
									boxId,
									updates
								);
								this.display();
							})
					);

				if (boxSettings.backgroundColor === "custom") {
					const setting = new Setting(boxDiv).setName(
						"Custom Background Color"
					);
					let textComponent: any;

					setting
						.addText((text) => {
							textComponent = text;
							return text
								.setValue(boxSettings.customBackgroundColor)
								.onChange(async (value) => {
									await this.plugin.manager.updateOneBoxSettings(
										boxId,
										{
											customBackgroundColor: value,
										}
									);
								});
						})
						.addColorPicker((color) =>
							color
								.setValue(boxSettings.customBackgroundColor)
								.onChange(async (value) => {
									await this.plugin.manager.updateOneBoxSettings(
										boxId,
										{
											customBackgroundColor: value,
										}
									);
									textComponent.setValue(value);
								})
						);
				}
				boxDiv.createEl("br");
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
								const updates: Partial<BoxSettings> = {
									textColor: value,
								};
								if (value === "custom") {
									updates.customTextColor = "#000000";
								}
								await this.plugin.manager.updateOneBoxSettings(
									boxId,
									updates
								);
								this.display();
							})
					);

				if (boxSettings.textColor === "custom") {
					const setting = new Setting(boxDiv).setName(
						"Custom Text Color"
					);
					let textComponent: any;

					setting
						.addText((text) => {
							textComponent = text;
							return text
								.setValue(boxSettings.customTextColor)
								.onChange(async (value) => {
									await this.plugin.manager.updateOneBoxSettings(
										boxId,
										{
											customTextColor: value,
										}
									);
								});
						})
						.addColorPicker((color) =>
							color
								.setValue(boxSettings.customTextColor)
								.onChange(async (value) => {
									await this.plugin.manager.updateOneBoxSettings(
										boxId,
										{
											customTextColor: value,
										}
									);
									textComponent.setValue(value);
								})
						);
				}
				boxDiv.createEl("br");
				new Setting(boxDiv).setName("Bold Text").addToggle((toggle) =>
					toggle
						.setValue(boxSettings.isBold)
						.onChange(async (value) => {
							await this.plugin.manager.updateOneBoxSettings(
								boxId,
								{
									isBold: value,
								}
							);
						})
				);
				boxDiv.createEl("br");
				new Setting(boxDiv).setName("Padding").addSlider((slider) =>
					slider
						.setLimits(8, 128, 1)
						.setValue(boxSettings.padding)
						.setDynamicTooltip()
						.onChange(async (value) => {
							await this.plugin.manager.updateOneBoxSettings(
								boxId,
								{
									padding: value,
								}
							);
						})
				);
				boxDiv.createEl("br");

				// Add delete button at the bottom of each box's settings
				new Setting(boxDiv).addButton((button) =>
					button
						.setButtonText("Delete")
						.setWarning()
						.setTooltip("Remove this floating datapoint")
						.onClick(async () => {
							this.plugin.manager.removeBox(boxId);
							this.display();
						})
				);

				// Add separator between boxes
				boxDiv.createEl("hr");
			}
		);

		containerEl.createEl("h2", { text: "Global Settings" });

		new Setting(containerEl)
			.setName("Daily Note End Time")
			.setDesc(
				"Set when your day ends (e.g., 04:00 for 4:00 AM next day)"
			)
			.addText((text) =>
				text
					.setPlaceholder("HH:mm")
					.setValue(this.plugin.settings.dailyNoteEndTime)
					.onChange(async (value) => {
						console.log("Attempting to change end time to:", value);
						const isValid =
							/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value);
						if (isValid) {
							console.log(
								"Valid time format, saving new end time"
							);
							this.plugin.settings.dailyNoteEndTime = value;
							await this.plugin.saveSettings();
							console.log(
								"New end time saved:",
								this.plugin.settings.dailyNoteEndTime
							);
						} else {
							console.log("Invalid time format");
							new Notice(
								"Please enter a valid time in HH:mm format"
							);
						}
					})
			);
	}
}
