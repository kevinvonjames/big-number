import { App, Plugin, PluginSettingTab, Setting, TFile, moment } from "obsidian";

interface FloatingNumberSettings {
    // Position only (remove size)
    position: { x: number; y: number };
    
    // Styling
    backgroundColor: string;
    customBackgroundColor: string;
    textColor: string;
    customTextColor: string;
    fontSize: number;
    padding: number;
    
    // Data
    dataType: 'dataview' | 'completedTasks' | 'uncompletedTasks' | 'wordCount';
    dataviewField: string;
    noDataMessage: string;
    isBold: boolean;
}

const DEFAULT_SETTINGS: FloatingNumberSettings = {
    position: { x: 20, y: 50 },
    backgroundColor: 'default',
    customBackgroundColor: '',
    textColor: 'default',
    customTextColor: '',
    fontSize: 32,
    padding: 20,
    dataType: 'dataview',
    dataviewField: 'todayNumber',
    noDataMessage: 'N/A',
    isBold: false,
}

export default class FloatingNumberPlugin extends Plugin {
    settings: FloatingNumberSettings;
    floatingBox: HTMLElement;
    isDragging: boolean = false;
    dragOffset: { x: number; y: number } = { x: 0, y: 0 };

    async onload() {
        await this.loadSettings();
        this.createFloatingBox();
        this.addSettingTab(new FloatingNumberSettingTab(this.app, this));
        this.updateFloatingBoxContent();

        // Update content when files change
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.updateFloatingBoxContent();
                }
            })
        );

        // Add drag functionality
        this.floatingBox.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('mouseup', this.onMouseUp.bind(this));
    }

    onunload() {
        if (this.floatingBox && this.floatingBox.parentNode) {
            this.floatingBox.parentNode.removeChild(this.floatingBox);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.updateFloatingBoxContent();
        this.updateFloatingBoxStyle();
    }

    private createFloatingBox() {
        this.floatingBox = document.createElement('div');
        this.floatingBox.addClass('floating-number-box');
        this.floatingBox.style.position = 'fixed';
        this.floatingBox.style.border = '2px solid var(--background-modifier-border)';
        this.floatingBox.style.borderRadius = '10px';
        this.floatingBox.style.zIndex = '1000';
        this.floatingBox.style.cursor = 'move';
        this.floatingBox.style.display = 'flex';
        this.floatingBox.style.alignItems = 'center';
        this.floatingBox.style.justifyContent = 'center';
        this.floatingBox.style.width = 'auto';
        this.floatingBox.style.height = 'auto';
        this.floatingBox.style.whiteSpace = 'nowrap';
        
        document.body.appendChild(this.floatingBox);
        this.updateFloatingBoxPosition();
        this.updateFloatingBoxStyle();
    }

    private async updateFloatingBoxContent() {
        const todayNumber = await this.getTodayNumber();
        const boldStyle = this.settings.isBold ? 'font-weight: bold;' : '';
        this.floatingBox.innerHTML = `<div style="font-size: ${this.settings.fontSize}px; ${boldStyle}">${todayNumber}</div>`;
    }

    private async getTodayNumber(): Promise<string> {
        const dailyNote = this.getTodayDailyNote();
        if (!dailyNote) return this.settings.noDataMessage;

        const content = await this.app.vault.read(dailyNote);
        
        switch (this.settings.dataType) {
            case 'completedTasks':
                return this.countCompletedTasks(content).toString();
            case 'uncompletedTasks':
                return this.countUncompletedTasks(content).toString();
            case 'wordCount':
                return this.countWords(content).toString();
            case 'dataview':
                const match = content.match(new RegExp(`${this.settings.dataviewField}:: (.+)`));
                return match ? match[1].trim() : this.settings.noDataMessage;
        }
    }

    private getTodayDailyNote(): TFile | null {
        const dailyNotePlugin = (this.app as any).internalPlugins.plugins['daily-notes'];
        if (!dailyNotePlugin?.enabled) return null;

        const format = dailyNotePlugin.instance?.options?.format || 'YYYY-MM-DD';
        const folder = dailyNotePlugin.instance?.options?.folder || '';
        const fileName = `${folder ? folder + '/' : ''}${moment().format(format)}.md`;
        
        return this.app.vault.getAbstractFileByPath(fileName) as TFile;
    }

    private onMouseDown(e: MouseEvent) {
        this.isDragging = true;
        this.dragOffset.x = e.clientX - this.settings.position.x;
        this.dragOffset.y = e.clientY - this.settings.position.y;
    }

    private onMouseMove(e: MouseEvent) {
        if (this.isDragging) {
            this.settings.position.x = e.clientX - this.dragOffset.x;
            this.settings.position.y = e.clientY - this.dragOffset.y;
            this.updateFloatingBoxPosition();
        }
    }

    private onMouseUp() {
        if (this.isDragging) {
            this.isDragging = false;
            this.saveSettings();
        }
    }

    private updateFloatingBoxPosition() {
        this.floatingBox.style.left = `${this.settings.position.x}px`;
        this.floatingBox.style.top = `${this.settings.position.y}px`;
    }

    private updateFloatingBoxStyle() {
        const bgColorMap = {
            'default': 'var(--background-primary)',
            'secondary': 'var(--background-secondary)',
            'tertiary': 'var(--background-tertiary)'
        };
        
        const textColorMap = {
            'default': 'var(--text-normal)',
            'muted': 'var(--text-muted)',
            'faint': 'var(--text-faint)'
        };

        this.floatingBox.style.backgroundColor = this.settings.backgroundColor === 'custom' 
            ? this.settings.customBackgroundColor 
            : bgColorMap[this.settings.backgroundColor as keyof typeof bgColorMap];

        this.floatingBox.style.color = this.settings.textColor === 'custom'
            ? this.settings.customTextColor
            : textColorMap[this.settings.textColor as keyof typeof textColorMap];

        this.floatingBox.style.padding = `${this.settings.padding}px`;
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
        return content.split(/\s+/).filter(word => word.length > 0).length;
    }

    // ... [Include the positioning and styling methods from the original code]
}

class FloatingNumberSettingTab extends PluginSettingTab {
    plugin: FloatingNumberPlugin;

    constructor(app: App, plugin: FloatingNumberPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        containerEl.createEl('h3', {text: 'Data Settings'});

        new Setting(containerEl)
            .setName('Data Type')
            .setDesc('Choose what type of data to display')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'dataview': 'Dataview Field',
                    'completedTasks': 'Completed Tasks',
                    'uncompletedTasks': 'Uncompleted Tasks',
                    'wordCount': 'Word Count'
                })
                .setValue(this.plugin.settings.dataType)
                .onChange(async (value: FloatingNumberSettings['dataType']) => {
                    this.plugin.settings.dataType = value;
                    await this.plugin.saveSettings();
                    this.display(); // Refresh to show/hide dataview field input
                }));

        if (this.plugin.settings.dataType === 'dataview') {
            new Setting(containerEl)
                .setName('Dataview Field')
                .setDesc('The dataview field to display from today\'s daily note')
                .addText(text => text
                    .setPlaceholder('e.g., todayNumber')
                    .setValue(this.plugin.settings.dataviewField)
                    .onChange(async (value) => {
                        this.plugin.settings.dataviewField = value;
                        await this.plugin.saveSettings();
                    }));
        }

        new Setting(containerEl)
            .setName('No Data Message')
            .setDesc('Message to display when no data is found')
            .addText(text => text
                .setPlaceholder('N/A')
                .setValue(this.plugin.settings.noDataMessage)
                .onChange(async (value) => {
                    this.plugin.settings.noDataMessage = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', {text: 'Appearance'});

        new Setting(containerEl)
            .setName('Background Color')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'default': 'Default',
                    'secondary': 'Secondary',
                    'tertiary': 'Tertiary',
                    'custom': 'Custom'
                })
                .setValue(this.plugin.settings.backgroundColor)
                .onChange(async (value) => {
                    this.plugin.settings.backgroundColor = value;
                    if (value === 'custom') {
                        this.plugin.settings.customBackgroundColor = '#ffffff';
                    }
                    await this.plugin.saveSettings();
                    this.display();
                }));

        if (this.plugin.settings.backgroundColor === 'custom') {
            new Setting(containerEl)
                .setName('Custom Background Color')
                .addText(text => text
                    .setValue(this.plugin.settings.customBackgroundColor)
                    .onChange(async (value) => {
                        this.plugin.settings.customBackgroundColor = value;
                        await this.plugin.saveSettings();
                    }))
                .addColorPicker(color => color
                    .setValue(this.plugin.settings.customBackgroundColor)
                    .onChange(async (value) => {
                        this.plugin.settings.customBackgroundColor = value;
                        await this.plugin.saveSettings();
                    }));
        }

        new Setting(containerEl)
            .setName('Text Color')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'default': 'Default',
                    'muted': 'Muted',
                    'faint': 'Faint',
                    'custom': 'Custom'
                })
                .setValue(this.plugin.settings.textColor)
                .onChange(async (value) => {
                    this.plugin.settings.textColor = value;
                    if (value === 'custom') {
                        this.plugin.settings.customTextColor = '#000000';
                    }
                    await this.plugin.saveSettings();
                    this.display();
                }));

        if (this.plugin.settings.textColor === 'custom') {
            new Setting(containerEl)
                .setName('Custom Text Color')
                .addText(text => text
                    .setValue(this.plugin.settings.customTextColor)
                    .onChange(async (value) => {
                        this.plugin.settings.customTextColor = value;
                        await this.plugin.saveSettings();
                    }))
                .addColorPicker(color => color
                    .setValue(this.plugin.settings.customTextColor)
                    .onChange(async (value) => {
                        this.plugin.settings.customTextColor = value;
                        await this.plugin.saveSettings();
                    }));
        }

        new Setting(containerEl)
            .setName('Bold Text')
            .setDesc('Make the displayed number bold')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.isBold)
                .onChange(async (value) => {
                    this.plugin.settings.isBold = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Font Size')
            .addSlider(slider => slider
                .setLimits(8, 256, 1)
                .setValue(this.plugin.settings.fontSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.fontSize = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Padding')
            .addSlider(slider => slider
                .setLimits(0, 50, 2)
                .setValue(this.plugin.settings.padding)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.padding = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', {text: 'Position'});

        new Setting(containerEl)
            .setName('Note')
            .setDesc('You can drag the floating box to reposition it');
    }
}
