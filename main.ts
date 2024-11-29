import { App, Plugin, PluginSettingTab, Setting, TFile, moment } from "obsidian";

interface FloatingNumber {
    id: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    backgroundColor: string;
    customBackgroundColor: string;
    textColor: string;
    customTextColor: string;
    fontSize: number;
    padding: number;
    dataType: 'completedTasks' | 'uncompletedTasks' | 'wordCount' | 'dataview';
    dataviewField: string;
    isBold: boolean;
}

interface FloatingNumberPluginSettings {
    floatingNumbers: FloatingNumber[];
    noDataMessage: string;
}

const DEFAULT_FLOATING_NUMBER: Omit<FloatingNumber, 'id'> = {
    position: { x: 20, y: 50 },
    size: { width: 150, height: 50 },
    backgroundColor: 'default',
    customBackgroundColor: '',
    textColor: 'default',
    customTextColor: '',
    fontSize: 16,
    padding: 10,
    dataType: 'dataview',
    dataviewField: '',
    isBold: false,
};

const DEFAULT_SETTINGS: FloatingNumberPluginSettings = {
    floatingNumbers: [],
    noDataMessage: 'N/A',
};

export default class FloatingNumberPlugin extends Plugin {
    settings: FloatingNumberPluginSettings;
    floatingBoxes: Record<string, HTMLElement> = {};
    private updateQueue: Record<string, NodeJS.Timeout> = {};
    
    // Store bound event handlers per box
    private boundEventHandlers: Record<string, {
        move: (e: MouseEvent | TouchEvent) => void;
        end: () => void;
    }> = {};

    async onload() {
        console.log('Loading FloatingNumberPlugin');
        
        try {
            await this.loadSettings();
            console.log('Settings loaded:', this.settings);
            
            // Ensure settings are valid
            if (!Array.isArray(this.settings.floatingNumbers)) {
                console.warn('Invalid floatingNumbers array, initializing empty array');
                this.settings.floatingNumbers = [];
            }
            
            // Create boxes
            this.createAllFloatingBoxes();
            
            // Add settings tab
            this.addSettingTab(new FloatingNumberSettingTab(this.app, this));
            
        } catch (error) {
            console.error('Error loading plugin:', error);
        }
    }

    private async loadSettings() {
        const savedData = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, savedData);
        
        // Ensure all floating numbers have required fields
        this.settings.floatingNumbers = this.settings.floatingNumbers.map(number => ({
            ...DEFAULT_FLOATING_NUMBER,
            ...number
        }));
    }

    async saveSettings() {
        console.log('Saving settings with numbers:', this.settings.floatingNumbers);
        await this.saveData(this.settings);
        // Recreate boxes after saving
        this.createAllFloatingBoxes();
    }

    private createAllFloatingBoxes() {
        console.log('Creating all floating boxes');
        // Remove existing boxes first
        this.removeAllFloatingBoxes();
        
        // Create new boxes
        this.settings.floatingNumbers.forEach(number => {
            console.log(`Creating box for number:`, number);
            this.createFloatingBox(number);
        });
    }

    private removeAllFloatingBoxes() {
        console.log('Removing all floating boxes');
        Object.values(this.floatingBoxes).forEach(box => {
            if (box && box.parentNode) {
                box.remove();
            }
        });
        this.floatingBoxes = {};
    }

    // Method to add a new floating number
    async addFloatingNumber() {
        console.log('Adding new floating number');
        const newNumber: FloatingNumber = {
            id: String(Date.now()),
            position: { x: 20, y: 50 },
            size: { width: 150, height: 50 },
            backgroundColor: 'default',
            customBackgroundColor: '',
            textColor: 'default',
            customTextColor: '',
            fontSize: 16,
            padding: 10,
            dataType: 'dataview',
            dataviewField: '',
            isBold: false
        };

        this.settings.floatingNumbers.push(newNumber);
        console.log('Added new number to settings:', newNumber);
        
        // Create the box immediately
        this.createFloatingBox(newNumber);
        
        // Save settings after creating the box
        await this.saveSettings();
    }

    private createFloatingBox(number: FloatingNumber) {
        const box = document.createElement('div');
        box.classList.add('floating-number-box');
        box.setAttribute('data-box-id', number.id);
        
        // Create content container first1
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('floating-number-content');
        box.appendChild(contentDiv);
        
        // Apply initial styles
        this.applyBoxStyles(box, number);
        
        // Add resize handles
        this.addResizeHandles(box);
        
        // Add event listeners
        this.addDragEvents(box, number);
        this.addResizeListeners(box, number);
        
        // Add to DOM and store reference
        document.body.appendChild(box);
        this.floatingBoxes[number.id] = box;
        
        // Update content
        this.updateBoxContent(number, contentDiv);
    }

    private addResizeHandles(box: HTMLElement) {
        const directions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
        
        directions.forEach(direction => {
            const handle = document.createElement('div');
            handle.className = `resize-handle resize-${direction}`;
            handle.setAttribute('data-direction', direction);
            
            // Apply handle styles
            Object.assign(handle.style, {
                position: 'absolute',
                width: '10px',
                height: '10px',
                backgroundColor: 'var(--background-modifier-border)',
                borderRadius: '50%',
                cursor: `${direction}-resize`,
                opacity: '0',
                transition: 'opacity 0.2s',
                zIndex: '1001'
            });
            
            this.positionResizeHandle(handle, direction);
            box.appendChild(handle);
        });
        
        // Show/hide handles on hover
        box.addEventListener('mouseenter', () => {
            box.querySelectorAll('.resize-handle').forEach(handle => {
                (handle as HTMLElement).style.opacity = '1';
            });
        });
        
        box.addEventListener('mouseleave', () => {
            if (!box.dataset.isResizing) {
                box.querySelectorAll('.resize-handle').forEach(handle => {
                    (handle as HTMLElement).style.opacity = '0';
                });
            }
        });
    }

    private addResizeListeners(box: HTMLElement, number: FloatingNumber) {
        const handles = box.querySelectorAll('.resize-handle');
        
        handles.forEach(handle => {
            const handleResize = (e: MouseEvent | TouchEvent) => {
                e.preventDefault();
                e.stopPropagation();
                
                const direction = (handle as HTMLElement).dataset.direction;
                if (!direction) return;
                
                box.dataset.isResizing = 'true';
                
                // Get initial dimensions and positions
                const startWidth = box.offsetWidth;
                const startHeight = box.offsetHeight;
                const startX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
                const startY = e instanceof MouseEvent ? e.clientY : e.touches[0].clientY;
                const startPosX = number.position.x;
                const startPosY = number.position.y;
                
                const onMove = (moveEvent: MouseEvent | TouchEvent) => {
                    moveEvent.preventDefault();
                    
                    const currentX = moveEvent instanceof MouseEvent 
                        ? moveEvent.clientX 
                        : moveEvent.touches[0].clientX;
                    const currentY = moveEvent instanceof MouseEvent 
                        ? moveEvent.clientY 
                        : moveEvent.touches[0].clientY;
                    
                    const deltaX = currentX - startX;
                    const deltaY = currentY - startY;
                    
                    // Calculate new dimensions based on direction
                    if (direction.includes('e')) {
                        number.size.width = Math.max(50, startWidth + deltaX);
                    }
                    if (direction.includes('w')) {
                        const newWidth = Math.max(50, startWidth - deltaX);
                        number.position.x = startPosX + (startWidth - newWidth);
                        number.size.width = newWidth;
                    }
                    if (direction.includes('s')) {
                        number.size.height = Math.max(30, startHeight + deltaY);
                    }
                    if (direction.includes('n')) {
                        const newHeight = Math.max(30, startHeight - deltaY);
                        number.position.y = startPosY + (startHeight - newHeight);
                        number.size.height = newHeight;
                    }
                    
                    // Apply new dimensions
                    this.applyBoxStyles(box, number);
                };
                
                const onEnd = () => {
                    delete box.dataset.isResizing;
                    
                    document.removeEventListener('mousemove', onMove as EventListener);
                    document.removeEventListener('touchmove', onMove as EventListener);
                    document.removeEventListener('mouseup', onEnd as EventListener);
                    document.removeEventListener('touchend', onEnd as EventListener);
                    
                    this.throttledSaveSettings();
                };
                
                document.addEventListener('mousemove', onMove as EventListener);
                document.addEventListener('touchmove', onMove as EventListener, { passive: false });
                document.addEventListener('mouseup', onEnd as EventListener);
                document.addEventListener('touchend', onEnd as EventListener);
            };
            
            handle.addEventListener('mousedown', handleResize as EventListener);
            handle.addEventListener('touchstart', handleResize as EventListener, { passive: false });
        });
    }

    private positionResizeHandle(handle: HTMLElement, position: string) {
        const offset = '-5px';
        switch (position) {
            case 'nw': 
                handle.style.top = handle.style.left = offset; 
                break;
            case 'n': 
                handle.style.top = offset;
                handle.style.left = '50%';
                handle.style.transform = 'translateX(-50%)';
                break;
            case 'ne': 
                handle.style.top = handle.style.right = offset;
                break;
            case 'e': 
                handle.style.right = offset;
                handle.style.top = '50%';
                handle.style.transform = 'translateY(-50%)';
                break;
            case 'se': 
                handle.style.bottom = handle.style.right = offset;
                break;
            case 's': 
                handle.style.bottom = offset;
                handle.style.left = '50%';
                handle.style.transform = 'translateX(-50%)';
                break;
            case 'sw': 
                handle.style.bottom = handle.style.left = offset;
                break;
            case 'w': 
                handle.style.left = offset;
                handle.style.top = '50%';
                handle.style.transform = 'translateY(-50%)';
                break;
        }
    }

    private addTouchPinchEvents(box: HTMLElement, number: FloatingNumber) {
        let initialDistance: number | null = null;
        let initialSize = { width: 0, height: 0 };
        let initialCenter = { x: 0, y: 0 };

        box.addEventListener('touchstart', (e: TouchEvent) => {
            if (e.touches.length !== 2) return;
            e.preventDefault();

            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            
            initialDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            
            initialSize = { 
                width: box.offsetWidth, 
                height: box.offsetHeight 
            };
            
            initialCenter = {
                x: (touch1.clientX + touch2.clientX) / 2,
                y: (touch1.clientY + touch2.clientY) / 2
            };
            
            box.style.transition = 'none';
        });

        // ... continue with touchmove and touchend handlers ...
    }

    // Utility methods
    private getEventPosition(e: MouseEvent | TouchEvent): { x: number; y: number } | null {
        if (e instanceof MouseEvent) {
            return { x: e.clientX, y: e.clientY };
        } else if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return null;
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(Math.max(value, min), max);
    }

    private throttledSaveSettings = this.throttle(() => {
        this.saveSettings();
    }, 500);

    private throttle(func: Function, limit: number) {
        let inThrottle: boolean;
        return (...args: any[]) => {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    private async updateBoxContent(number: FloatingNumber, container: HTMLElement) {
        try {
            console.log(`Updating content for box ${number.id}`);
            const content = await this.getTodayNumber(number);
            container.textContent = content || this.settings.noDataMessage;
        } catch (error) {
            console.error(`Error updating content for box ${number.id}:`, error);
            container.textContent = this.settings.noDataMessage;
        }
    }

    private getTodayDailyNote(): TFile | null {
        console.log('Getting today\'s daily note');
        
        // Get daily notes plugin
        const dailyNotePlugin = (this.app as any).internalPlugins.plugins['daily-notes'];
        if (!dailyNotePlugin?.enabled) {
            console.warn('Daily notes plugin is not enabled');
            return null;
        }

        try {
            // Get format and folder from plugin settings
            const format = dailyNotePlugin.instance?.options?.format || 'YYYY-MM-DD';
            const folder = dailyNotePlugin.instance?.options?.folder || '';
            
            // Generate today's filename
            const fileName = `${folder ? folder + '/' : ''}${moment().format(format)}.md`;
            console.log(`Looking for daily note: ${fileName}`);
            
            // Get file from vault
            const file = this.app.vault.getAbstractFileByPath(fileName);
            if (!file || !(file instanceof TFile)) {
                console.warn('Daily note not found');
                return null;
            }
            
            return file;
        } catch (error) {
            console.error('Error getting daily note:', error);
            return null;
        }
    }

    private countCompletedTasks(content: string): number {
        try {
            const completedTaskRegex = /^- \[x\] .+$/gm;
            const matches = content.match(completedTaskRegex) || [];
            console.log(`Found ${matches.length} completed tasks`);
            return matches.length;
        } catch (error) {
            console.error('Error counting completed tasks:', error);
            return 0;
        }
    }

    private countUncompletedTasks(content: string): number {
        try {
            const uncompletedTaskRegex = /^- \[ \] .+$/gm;
            const matches = content.match(uncompletedTaskRegex) || [];
            console.log(`Found ${matches.length} uncompleted tasks`);
            return matches.length;
        } catch (error) {
            console.error('Error counting uncompleted tasks:', error);
            return 0;
        }
    }

    private countWords(content: string): number {
        try {
            // Remove markdown syntax and split by whitespace
            const cleanContent = content
                .replace(/```[\s\S]*?```/g, '') // Remove code blocks
                .replace(/`[^`]*`/g, '')        // Remove inline code
                .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // Replace links with text
                .replace(/[#*_~`]/g, '')        // Remove markdown symbols
                .trim();
            
            const words = cleanContent.split(/\s+/).filter(word => word.length > 0);
            console.log(`Found ${words.length} words`);
            return words.length;
        } catch (error) {
            console.error('Error counting words:', error);
            return 0;
        }
    }

    private async getTodayNumber(number: FloatingNumber): Promise<string> {
        const dailyNote = this.getTodayDailyNote();
        if (!dailyNote) {
            console.warn('No daily note found');
            return this.settings.noDataMessage;
        }

        try {
            const content = await this.app.vault.read(dailyNote);
            console.log(`Retrieved content length: ${content.length}`);

            switch (number.dataType) {
                case 'completedTasks':
                    const completed = this.countCompletedTasks(content);
                    console.log(`Completed tasks: ${completed}`);
                    return completed.toString();
                    
                case 'uncompletedTasks':
                    const uncompleted = this.countUncompletedTasks(content);
                    console.log(`Uncompleted tasks: ${uncompleted}`);
                    return uncompleted.toString();
                    
                case 'wordCount':
                    const words = this.countWords(content);
                    console.log(`Word count: ${words}`);
                    return words.toString();
                    
                case 'dataview':
                    if (!number.dataviewField) {
                        console.warn('No dataview field specified');
                        return this.settings.noDataMessage;
                    }
                    const regex = new RegExp(`${number.dataviewField}:: (.+)`, 'i');
                    const match = content.match(regex);
                    console.log(`Dataview match for ${number.dataviewField}:`, match?.[1]);
                    return match?.[1]?.trim() || this.settings.noDataMessage;
                    
                default:
                    console.warn(`Unknown data type: ${number.dataType}`);
                    return this.settings.noDataMessage;
            }
        } catch (error) {
            console.error('Error getting today number:', error);
            return this.settings.noDataMessage;
        }
    }

    private getValidPosition(position: { x: number; y: number }) {
        // Get viewport dimensions
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Ensure minimum distance from edges
        const minDistance = 20;
        const maxX = viewportWidth - 150; // Assuming minimum box width
        const maxY = viewportHeight - 60; // Assuming minimum box height
        
        return {
            x: Math.max(minDistance, Math.min(maxX, position.x)),
            y: Math.max(minDistance, Math.min(maxY, position.y))
        };
    }

    private updateFloatingBoxPosition(number: FloatingNumber, box: HTMLElement) {
        // Ensure position is within viewport bounds
        const maxX = window.innerWidth - box.offsetWidth;
        const maxY = window.innerHeight - box.offsetHeight;
        
        const x = Math.max(0, Math.min(maxX, number.position.x));
        const y = Math.max(0, Math.min(maxY, number.position.y));

        box.style.left = `${x}px`;
        box.style.top = `${y}px`;
    }

    private updateFloatingBoxStyle(number: FloatingNumber, box: HTMLElement) {
        // Font settings
        box.style.fontSize = `${number.fontSize || 16}px`;
        box.style.fontWeight = number.isBold ? 'bold' : 'normal';
        
        // Colors
        if (number.backgroundColor === 'default') {
            box.style.backgroundColor = 'var(--background-primary)';
        } else {
            box.style.backgroundColor = number.customBackgroundColor || 'var(--background-primary)';
        }
        
        if (number.textColor === 'default') {
            box.style.color = 'var(--text-normal)';
        } else {
            box.style.color = number.customTextColor || 'var(--text-normal)';
        }
        
        // Ensure box is visible
        box.style.opacity = '1';
        box.style.visibility = 'visible';
    }

    private isElementVisible(element: HTMLElement): boolean {
        const rect = element.getBoundingClientRect();
        return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= window.innerHeight &&
            rect.right <= window.innerWidth
        );
    }

    // Helper methods for colors
    private getBackgroundColor(number: FloatingNumber): string {
        return number.backgroundColor === 'custom'
            ? number.customBackgroundColor || 'var(--background-primary)'
            : 'var(--background-primary)';
    }

    private getTextColor(number: FloatingNumber): string {
        return number.textColor === 'custom'
            ? number.customTextColor || 'var(--text-normal)'
            : 'var(--text-normal)';
    }

    private applyBoxStyles(box: HTMLElement, number: FloatingNumber) {
        const styles: Partial<CSSStyleDeclaration> = {
            position: 'fixed',
            left: `${number.position.x}px`,
            top: `${number.position.y}px`,
            width: `${number.size.width}px`,
            height: `${number.size.height}px`,
            backgroundColor: this.getBackgroundColor(number),
            color: this.getTextColor(number),
            fontSize: `${number.fontSize}px`,
            fontWeight: number.isBold ? 'bold' : 'normal',
            padding: `${number.padding}px`,
            border: '1px solid var(--background-modifier-border)',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            zIndex: '1000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
            cursor: 'move',
            transition: 'background-color 0.2s, color 0.2s, box-shadow 0.2s'
        };

        Object.assign(box.style, styles);
    }

    private addDragEvents(box: HTMLElement, number: FloatingNumber) {
        let isDragging = false;
        let startPos = { x: 0, y: 0 };
        let startMousePos = { x: 0, y: 0 };

        const onDragStart = (e: MouseEvent | TouchEvent) => {
            if (box.dataset.isResizing) return;
            e.preventDefault();
            
            const pos = this.getEventPosition(e);
            if (!pos) return;

            isDragging = true;
            box.dataset.isDragging = 'true';
            startPos = { ...number.position };
            startMousePos = pos;

            box.style.zIndex = '1001';
            box.style.cursor = 'grabbing';
            box.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
            box.style.transition = 'none';
        };

        const onDragMove = (e: MouseEvent | TouchEvent) => {
            if (!isDragging) return;
            e.preventDefault();

            const pos = this.getEventPosition(e);
            if (!pos) return;

            const deltaX = pos.x - startMousePos.x;
            const deltaY = pos.y - startMousePos.y;

            // Calculate new position with bounds checking
            number.position.x = this.clamp(
                startPos.x + deltaX,
                0,
                window.innerWidth - box.offsetWidth
            );
            number.position.y = this.clamp(
                startPos.y + deltaY,
                0,
                window.innerHeight - box.offsetHeight
            );

            box.style.left = `${number.position.x}px`;
            box.style.top = `${number.position.y}px`;
        };

        const onDragEnd = () => {
            if (!isDragging) return;

            isDragging = false;
            delete box.dataset.isDragging;
            box.style.zIndex = '1000';
            box.style.cursor = 'move';
            box.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
            box.style.transition = 'background-color 0.2s, color 0.2s, box-shadow 0.2s';

            this.throttledSaveSettings();
        };

        // Mouse events
        box.addEventListener('mousedown', onDragStart as EventListener);
        document.addEventListener('mousemove', onDragMove as EventListener);
        document.addEventListener('mouseup', onDragEnd as EventListener);

        // Touch events
        box.addEventListener('touchstart', onDragStart as EventListener, { passive: false });
        document.addEventListener('touchmove', onDragMove as EventListener, { passive: false });
        document.addEventListener('touchend', onDragEnd as EventListener);
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

        // Add button for new floating number
        new Setting(containerEl)
            .setName('Add New Floating Number')
            .setDesc('Create a new floating number display')
            .addButton(button => button
                .setButtonText('Add')
                .onClick(async () => {
                    const newNumber = {
                        ...DEFAULT_FLOATING_NUMBER,
                        id: Date.now().toString()
                    };
                    this.plugin.settings.floatingNumbers.push(newNumber);
                    await this.plugin.saveSettings();
                    this.display(); // Refresh settings
                }));

        // Global Settings Section
        containerEl.createEl('h3', {text: 'Global Settings'});

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

        // Floating Numbers Section
        containerEl.createEl('h3', {text: 'Floating Numbers'});

        // Create settings section for each floating number
        this.plugin.settings.floatingNumbers.forEach((number, index) => {
            const numberContainer = containerEl.createDiv('floating-number-settings');
            numberContainer.createEl('h4', {text: `Floating Number ${index + 1}`});

            // Delete button
            new Setting(numberContainer)
                .setName('Remove')
                .addButton(button => button
                    .setButtonText('Delete')
                    .setWarning()
                    .onClick(async () => {
                        this.plugin.settings.floatingNumbers = 
                            this.plugin.settings.floatingNumbers.filter(n => n.id !== number.id);
                        await this.plugin.saveSettings();
                        this.display();
                    }));

            // Data Type Setting
            new Setting(numberContainer)
                .setName('Data Type')
                .setDesc('Choose what type of data to display')
                .addDropdown(dropdown => dropdown
                    .addOptions({
                        'completedTasks': 'Completed Tasks',
                        'uncompletedTasks': 'Uncompleted Tasks',
                        'wordCount': 'Word Count',
                        'dataview': 'Dataview Field'
                    })
                    .setValue(number.dataType)
                    .onChange(async (value: FloatingNumber['dataType']) => {
                        number.dataType = value;
                        await this.plugin.saveSettings();
                        this.display();
                    }));

            // Dataview Field (only show if dataview is selected)
            if (number.dataType === 'dataview') {
                new Setting(numberContainer)
                    .setName('Dataview Field')
                    .setDesc('The dataview field to display from today\'s daily note')
                    .addText(text => text
                        .setPlaceholder('e.g., todayNumber')
                        .setValue(number.dataviewField)
                        .onChange(async (value) => {
                            number.dataviewField = value;
                            await this.plugin.saveSettings();
                        }));
            }

            // Appearance Settings
            new Setting(numberContainer)
                .setName('Background Color')
                .addDropdown(dropdown => dropdown
                    .addOptions({
                        'default': 'Default',
                        'secondary': 'Secondary',
                        'tertiary': 'Tertiary',
                        'custom': 'Custom'
                    })
                    .setValue(number.backgroundColor)
                    .onChange(async (value) => {
                        number.backgroundColor = value;
                        if (value === 'custom') {
                            number.customBackgroundColor = '#ffffff';
                        }
                        await this.plugin.saveSettings();
                        this.display();
                    }));

            if (number.backgroundColor === 'custom') {
                new Setting(numberContainer)
                    .setName('Custom Background Color')
                    .addText(text => text
                        .setValue(number.customBackgroundColor)
                        .onChange(async (value) => {
                            number.customBackgroundColor = value;
                            await this.plugin.saveSettings();
                        }))
                    .addColorPicker(color => color
                        .setValue(number.customBackgroundColor)
                        .onChange(async (value) => {
                            number.customBackgroundColor = value;
                            await this.plugin.saveSettings();
                        }));
            }

            new Setting(numberContainer)
                .setName('Text Color')
                .addDropdown(dropdown => dropdown
                    .addOptions({
                        'default': 'Default',
                        'muted': 'Muted',
                        'faint': 'Faint',
                        'custom': 'Custom'
                    })
                    .setValue(number.textColor)
                    .onChange(async (value) => {
                        number.textColor = value;
                        if (value === 'custom') {
                            number.customTextColor = '#000000';
                        }
                        await this.plugin.saveSettings();
                        this.display();
                    }));

            if (number.textColor === 'custom') {
                new Setting(numberContainer)
                    .setName('Custom Text Color')
                    .addText(text => text
                        .setValue(number.customTextColor)
                        .onChange(async (value) => {
                            number.customTextColor = value;
                            await this.plugin.saveSettings();
                        }))
                    .addColorPicker(color => color
                        .setValue(number.customTextColor)
                        .onChange(async (value) => {
                            number.customTextColor = value;
                            await this.plugin.saveSettings();
                        }));
            }

            new Setting(numberContainer)
                .setName('Bold Text')
                .setDesc('Make the displayed number bold')
                .addToggle(toggle => toggle
                    .setValue(number.isBold)
                    .onChange(async (value) => {
                        number.isBold = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(numberContainer)
                .setName('Padding')
                .setDesc('Set the padding for the floating box')
                .addSlider(slider => slider
                    .setLimits(0, 64, 1)
                    .setValue(number.padding)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        number.padding = value;
                        await this.plugin.saveSettings();
                    }));
        });
    }
}