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
    dataType: 'completedTasks' | 'uncompletedTasks' | 'wordCount' | 'dataview';
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
    fontSize: 16,
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
    isResizing: boolean = false;
    resizeEdge: string | null = null;
    dragOffset: { x: number; y: number } = { x: 0, y: 0 };
    initialFontSize: number | null = null;
    initialMousePos: { x: number; y: number } | null = null;
    initialPinchDistance: number | null = null;

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

        // Add both mouse and touch events
        this.floatingBox.addEventListener('mousedown', this.onDragStart.bind(this));
        this.floatingBox.addEventListener('touchstart', this.onDragStart.bind(this), { passive: false });
        
        document.addEventListener('mousemove', this.onDragMove.bind(this));
        document.addEventListener('touchmove', this.onDragMove.bind(this), { passive: false });
        
        document.addEventListener('mouseup', this.onDragEnd.bind(this));
        document.addEventListener('touchend', this.onDragEnd.bind(this));

        // Add gesture event listener for pinch
        this.floatingBox.addEventListener('gesturestart', this.onGestureStart.bind(this));
        this.floatingBox.addEventListener('gesturechange', this.onGestureChange.bind(this));
        this.floatingBox.addEventListener('gestureend', this.onGestureEnd.bind(this));

        // Fallback for browsers that don't support gesture events
        this.floatingBox.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
        this.floatingBox.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
        this.floatingBox.addEventListener('touchend', this.onTouchEnd.bind(this));

        // Add mousemove listener for resize cursors
        this.floatingBox.addEventListener('mousemove', this.onMouseMoveResize.bind(this));
        this.floatingBox.addEventListener('mousedown', this.onMouseDownResize.bind(this));
        document.addEventListener('mousemove', this.onResizing.bind(this));
        document.addEventListener('mouseup', this.onResizeEnd.bind(this));
    }

    onunload() {
        if (this.floatingBox && this.floatingBox.parentNode) {
            this.floatingBox.parentNode.removeChild(this.floatingBox);
        }
        // Clean up event listeners
        document.removeEventListener('mousemove', this.onDragMove.bind(this));
        document.removeEventListener('touchmove', this.onDragMove.bind(this));
        document.removeEventListener('mouseup', this.onDragEnd.bind(this));
        document.removeEventListener('touchend', this.onDragEnd.bind(this));
        document.removeEventListener('mousemove', this.onResizing.bind(this));
        document.removeEventListener('mouseup', this.onResizeEnd.bind(this));
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
        
        // Add clean resize styles
        this.floatingBox.style.minWidth = '30px';
        this.floatingBox.style.minHeight = '30px';
        
        document.body.appendChild(this.floatingBox);
        this.updateFloatingBoxPosition();
        this.updateFloatingBoxStyle();

        // Use mouseenter instead of mousemove for better performance
        this.floatingBox.addEventListener('mouseenter', () => {
            this.floatingBox.addEventListener('mousemove', this.onMouseMoveResize.bind(this));
        });
        
        this.floatingBox.addEventListener('mouseleave', () => {
            if (!this.isResizing) {
                this.floatingBox.removeEventListener('mousemove', this.onMouseMoveResize.bind(this));
                this.floatingBox.style.cursor = 'move';
            }
        });

        this.floatingBox.addEventListener('mousedown', this.onMouseDownResize.bind(this));
        document.addEventListener('mousemove', this.onResizing.bind(this));
        document.addEventListener('mouseup', this.onResizeEnd.bind(this));
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

    private onDragStart(e: MouseEvent | TouchEvent) {
        if (e instanceof MouseEvent) {
            const box = this.floatingBox.getBoundingClientRect();
            const edge = this.getResizeEdge(e, box);
            if (edge) return; // Don't start dragging if we're on a resize handle
        }
        
        if (e instanceof TouchEvent && e.touches.length === 2) {
            // Don't start dragging if it's a pinch gesture
            return;
        }
        e.preventDefault();
        this.isDragging = true;

        const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
        const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0].clientY;

        this.dragOffset.x = clientX - this.settings.position.x;
        this.dragOffset.y = clientY - this.settings.position.y;
    }

    private onDragMove(e: MouseEvent | TouchEvent) {
        if (!this.isDragging) return;
        e.preventDefault();

        const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
        const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0].clientY;

        this.settings.position.x = clientX - this.dragOffset.x;
        this.settings.position.y = clientY - this.dragOffset.y;
        this.updateFloatingBoxPosition();
    }

    private onDragEnd() {
        if (this.isDragging) {
            this.isDragging = false;
            this.saveSettings();
        }
    }

    private updateFloatingBoxPosition() {
        this.floatingBox.style.left = `${this.settings.position.x}px`;
        this.floatingBox.style.top = `${this.settings.position.y}px`;
    }

    public updateFloatingBoxStyle() {
        if (this.floatingBox) {
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

            // Apply background color
            this.floatingBox.style.backgroundColor = this.settings.backgroundColor === 'custom' 
                ? this.settings.customBackgroundColor 
                : bgColorMap[this.settings.backgroundColor as keyof typeof bgColorMap];

            // Apply text color
            this.floatingBox.style.color = this.settings.textColor === 'custom'
                ? this.settings.customTextColor
                : textColorMap[this.settings.textColor as keyof typeof textColorMap];

            // Apply padding
            this.floatingBox.style.padding = `${this.settings.padding}px`;
            
            this.updateFloatingBoxContent();
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
        return content.split(/\s+/).filter(word => word.length > 0).length;
    }

    private onGestureStart(e: any) {
        e.preventDefault();
        this.initialFontSize = this.settings.fontSize;
    }

    private onGestureChange(e: any) {
        e.preventDefault();
        if (this.initialFontSize) {
            // Adjust font size based on gesture scale
            const newSize = Math.round(this.initialFontSize * e.scale);
            // Limit the size range
            this.settings.fontSize = Math.min(Math.max(newSize, 8), 256);
            this.updateFloatingBoxContent();
        }
    }

    private onGestureEnd(e: any) {
        e.preventDefault();
        this.initialFontSize = null;
        this.saveSettings();
    }

    // Fallback touch handlers for pinch zoom
    private onTouchStart(e: TouchEvent) {
        if (e.touches.length === 2) {
            e.preventDefault();
            // Calculate initial distance between touch points
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            this.initialPinchDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            this.initialFontSize = this.settings.fontSize;
        }
    }

    private onTouchMove(e: TouchEvent) {
        if (e.touches.length === 2 && this.initialPinchDistance && this.initialFontSize) {
            e.preventDefault();
            // Calculate new distance between touch points
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const currentDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );

            // Calculate scale factor
            const scale = currentDistance / this.initialPinchDistance;
            
            // Adjust font size based on scale
            const newSize = Math.round(this.initialFontSize * scale);
            // Limit the size range
            this.settings.fontSize = Math.min(Math.max(newSize, 8), 256);
            this.updateFloatingBoxContent();
        }
    }

    private onTouchEnd(e: TouchEvent) {
        if (this.initialPinchDistance !== null) {
            this.initialPinchDistance = null;
            this.initialFontSize = null;
            this.saveSettings();
        }
    }

    private getResizeEdge(e: MouseEvent, box: DOMRect): string | null {
        const RESIZE_HANDLE = 8; // pixels from edge
        const x = e.clientX - box.left;
        const y = e.clientY - box.top;
        
        const isLeft = x < RESIZE_HANDLE;
        const isRight = x > box.width - RESIZE_HANDLE;
        const isTop = y < RESIZE_HANDLE;
        const isBottom = y > box.height - RESIZE_HANDLE;

        if (isLeft && isTop) return 'nw';
        if (isRight && isTop) return 'ne';
        if (isLeft && isBottom) return 'sw';
        if (isRight && isBottom) return 'se';
        if (isLeft) return 'w';
        if (isRight) return 'e';
        if (isTop) return 'n';
        if (isBottom) return 's';
        
        return null;
    }

    private getResizeCursor(edge: string): string {
        switch (edge) {
            case 'n':
            case 's':
                return 'ns-resize';
            case 'e':
            case 'w':
                return 'ew-resize';
            case 'ne':
            case 'sw':
                return 'nesw-resize';
            case 'nw':
            case 'se':
                return 'nwse-resize';
            default:
                return 'move';
        }
    }

    private onMouseMoveResize(e: MouseEvent) {
        if (this.isResizing) return;

        const box = this.floatingBox.getBoundingClientRect();
        const edge = this.getResizeEdge(e, box);
        
        if (edge) {
            e.stopPropagation();
            const cursor = this.getResizeCursor(edge);
            if (this.floatingBox.style.cursor !== cursor) {
                this.floatingBox.style.cursor = cursor;
            }
        } else if (this.floatingBox.style.cursor !== 'move') {
            this.floatingBox.style.cursor = 'move';
        }
    }

    private onMouseDownResize(e: MouseEvent) {
        const box = this.floatingBox.getBoundingClientRect();
        const edge = this.getResizeEdge(e, box);
        
        if (edge) {
            e.preventDefault();
            e.stopPropagation();
            this.isResizing = true;
            this.resizeEdge = edge;
            this.initialFontSize = this.settings.fontSize;
            this.initialMousePos = { x: e.clientX, y: e.clientY };
        } else {
            // Handle regular dragging
            this.isDragging = true;
            this.dragOffset.x = e.clientX - this.settings.position.x;
            this.dragOffset.y = e.clientY - this.settings.position.y;
        }
    }

    private onResizing(e: MouseEvent) {
        if (!this.isResizing || !this.initialFontSize || !this.initialMousePos) return;

        const deltaX = e.clientX - this.initialMousePos.x;
        const deltaY = e.clientY - this.initialMousePos.y;
        
        // Calculate scale factor based on movement
        let scaleFactor = 1;
        if (this.resizeEdge?.includes('e') || this.resizeEdge?.includes('w')) {
            scaleFactor = 1 + (deltaX / 200); // Adjust sensitivity here
        }
        if (this.resizeEdge?.includes('n') || this.resizeEdge?.includes('s')) {
            scaleFactor = 1 + (deltaY / 200); // Adjust sensitivity here
        }

        // Calculate new font size
        const newSize = Math.round(this.initialFontSize * scaleFactor);
        this.settings.fontSize = Math.min(Math.max(newSize, 8), 256);
        
        this.updateFloatingBoxContent();
    }

    private onResizeEnd() {
        if (this.isResizing) {
            this.isResizing = false;
            this.resizeEdge = null;
            this.initialFontSize = null;
            this.initialMousePos = null;
            this.saveSettings();
        }
    }
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
                    'completedTasks': 'Completed Tasks',
                    'uncompletedTasks': 'Uncompleted Tasks',
                    'wordCount': 'Word Count',
                    'dataview': 'Dataview Field'
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
            .setName('Padding')
            .setDesc('Set the padding for the floating box')
            .addSlider(slider => slider
                .setLimits(0, 64, 1)
                .setValue(this.plugin.settings.padding)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.padding = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateFloatingBoxStyle();
                }));

    }
}
