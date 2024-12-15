import { FloatingBoxManager } from "./FloatingBoxManager";
import { BoxSettings } from "./settings";

export class FloatingBox {
	private static readonly RESIZE_HANDLE = 8; // pixels from edge
	private static readonly MIN_PADDING = 8;
	private static readonly MAX_PADDING = 64;
	private static readonly MIN_FONT_SIZE = 12;
	private id: string;
	private manager: FloatingBoxManager;
	private element: HTMLElement;
	private settings: BoxSettings;

	// State variables
	private isMouseOver = false as boolean;
	private isDragging = false as boolean;
	private isResizing = false as boolean;
	private resizeEdge: string | null = null;
	private dragOffset: { x: number; y: number } = { x: 0, y: 0 };
	private initialFontSize: number | null = null;
	private initialMousePos: { x: number; y: number } | null = null;

	private listeners: Array<{
		target: EventTarget;
		type: string;
		handler: EventListenerOrEventListenerObject;
		options?: AddEventListenerOptions;
	}> = [];

	constructor(
		manager: FloatingBoxManager,
		id: string,
		settings: BoxSettings
	) {
		// console.log("FloatingBox constructor called");

		this.manager = manager;
		this.id = id;
		this.settings = {
			...settings,
			position: { ...settings.position },
		};
		this.createDOM().then(() => {
			this.attachEventListeners();
		});
	}

	private async createDOM() {
		//console.log("createDOM called"); // Add this

		// Create main container
		this.element = document.createElement("div");
		this.element.addClass("floating-number-box");
		this.element.style.zIndex = this.settings.zIndex.toString(); // Set it once here

		// Create permanent inner content div
		const contentDiv = document.createElement("div");
		contentDiv.className = "content";
		this.element.appendChild(contentDiv);

		document.body.appendChild(this.element);
		this.updatePosition();
		this.updateStyle();
		await this.updateContent();
	}

	private addListener(
		target: EventTarget,
		type: string,
		handler: EventListenerOrEventListenerObject,
		options?: AddEventListenerOptions
	) {
		const boundHandler =
			typeof handler === "function" ? handler.bind(this) : handler;
		target.addEventListener(type, boundHandler, options);
		this.listeners.push({ target, type, handler: boundHandler, options });
	}

	private attachEventListeners() {
		// Document listeners
		this.addListener(document, "mouseup", this.onResizeEnd);
		this.addListener(document, "mousemove", (e: MouseEvent) => {
			if (this.isResizing) {
				this.onResizing(e);
			} else if (this.isDragging) {
				this.onDragMove(e);
			}
		});
		this.addListener(document, "touchmove", this.onDragMove);
		this.addListener(document, "mouseup", this.onDragEnd);
		this.addListener(document, "touchend", this.onDragEnd);

		// Element listeners
		this.addListener(this.element, "mouseenter", () => {
			this.isMouseOver = true;
		});
		this.addListener(this.element, "mouseleave", () => {
			if (!this.isResizing) {
				this.isMouseOver = false;
				this.element.style.cursor = "move";
			}
		});
		this.addListener(this.element, "mousemove", this.setCursorStyle);
		this.addListener(this.element, "mousedown", this.onBoxMouseDown);
		this.addListener(this.element, "mousedown", this.onDragStart);
		this.addListener(this.element, "touchstart", this.onDragStart, {
			passive: false,
		});
	}

	public destroy() {
		// Remove all listeners
		this.listeners.forEach(({ target, type, handler, options }) => {
			target.removeEventListener(type, handler, options);
		});
		this.listeners = [];

		// Remove element
		if (this.element?.parentNode) {
			this.element.parentNode.removeChild(this.element);
		}

		// Clean up references
		(this.element as any) = null;
		(this.manager as any) = null;
	}

	private updatePosition() {
		this.element.style.left = `${this.settings.position.x}px`;
		this.element.style.top = `${this.settings.position.y}px`;
	}

	private updateStyle() {
		if (this.settings.backgroundColor === "custom") {
			this.element.style.backgroundColor =
				this.settings.customBackgroundColor;
		} else {
			this.element.style.backgroundColor = `var(--floating-number-bg-${this.settings.backgroundColor})`;
		}

		if (this.settings.textColor === "custom") {
			this.element.style.color = this.settings.customTextColor;
		} else {
			this.element.style.color = `var(--floating-number-text-${this.settings.textColor})`;
		}

		this.element.style.padding = `${this.settings.padding}px`;
	}

	private setCursorStyle(e: MouseEvent) {
		if (!this.isMouseOver) return;
		if (this.isResizing) return;

		const box = this.element.getBoundingClientRect();
		const edge = this.detectResizeEdge(e, box);

		if (edge) {
			e.stopPropagation();
			const cursor = this.getResizeCursorStyle(edge);
			if (this.element.style.cursor !== cursor) {
				this.element.style.cursor = cursor;
			}
		} else if (this.element.style.cursor !== "move") {
			this.element.style.cursor = "move";
		}
	}

	private detectResizeEdge(e: MouseEvent, box: DOMRect): string | null {
		/*
		console.log("Detecting edge", {
			mouseX: e.clientX - box.left,
			mouseY: e.clientY - box.top,
		});
		*/
		const x = e.clientX - box.left;
		const y = e.clientY - box.top;

		const isLeft = x < FloatingBox.RESIZE_HANDLE;
		const isRight = x > box.width - FloatingBox.RESIZE_HANDLE;
		const isTop = y < FloatingBox.RESIZE_HANDLE;
		const isBottom = y > box.height - FloatingBox.RESIZE_HANDLE;

		if (isLeft && isTop) return "nw";
		if (isRight && isTop) return "ne";
		if (isLeft && isBottom) return "sw";
		if (isRight && isBottom) return "se";
		if (isLeft) return "w";
		if (isRight) return "e";
		if (isTop) return "n";
		if (isBottom) return "s";

		return null;
	}

	private getResizeCursorStyle(edge: string): string {
		switch (edge) {
			case "n":
			case "s":
				return "ns-resize";
			case "e":
			case "w":
				return "ew-resize";
			case "ne":
			case "sw":
				return "nesw-resize";
			case "nw":
			case "se":
				return "nwse-resize";
			default:
				return "nwse-resize";
		}
	}

	private onBoxMouseDown(e: MouseEvent) {
		// console.log("onBoxMouseDown triggered");

		const box = this.element.getBoundingClientRect();
		const edge = this.detectResizeEdge(e, box);

		if (edge) {
			// console.log("Resize started with edge:", edge);

			e.preventDefault();
			e.stopPropagation();
			this.isResizing = true;
			this.resizeEdge = edge;
			this.initialFontSize = this.settings.fontSize;
			this.initialMousePos = { x: e.clientX, y: e.clientY };

			// console.log("Resize state set:", {
			// 	isResizing: this.isResizing,
			// 	edge: this.resizeEdge,
			// 	fontSize: this.initialFontSize,
			// });
		} else {
			// Handle regular dragging
			this.isDragging = true;
			this.dragOffset.x = e.clientX - this.settings.position.x;
			this.dragOffset.y = e.clientY - this.settings.position.y;
		}
	}

	private onResizing(e: MouseEvent) {
		/*
		console.log("onResizing called", {
			isResizing: this.isResizing,
			initialFontSize: this.initialFontSize,
			initialMousePos: this.initialMousePos,
			resizeEdge: this.resizeEdge,
		}); */
		if (
			!this.isResizing ||
			!this.initialFontSize ||
			!this.initialMousePos ||
			!this.resizeEdge
		)
			return;

		const box = this.element.getBoundingClientRect();
		const MIN_SIZE =
			this.settings.padding * 2 + FloatingBox.RESIZE_HANDLE * 2;

		const center = {
			x: box.left + box.width / 2,
			y: box.top + box.height / 2,
		};

		let adjustedMouseX = e.clientX;
		let adjustedMouseY = e.clientY;

		if (this.resizeEdge.includes("w")) {
			adjustedMouseX -= FloatingBox.RESIZE_HANDLE;
		} else if (this.resizeEdge.includes("e")) {
			adjustedMouseX += FloatingBox.RESIZE_HANDLE;
		}

		if (this.resizeEdge.includes("n")) {
			adjustedMouseY -= FloatingBox.RESIZE_HANDLE;
		} else if (this.resizeEdge.includes("s")) {
			adjustedMouseY += FloatingBox.RESIZE_HANDLE;
		}

		const mouseToCenterX = Math.abs(adjustedMouseX - center.x);
		const mouseToCenterY = Math.abs(adjustedMouseY - center.y);

		const newSizeRaw = Math.max(mouseToCenterX, mouseToCenterY) * 2;
		const newSize = Math.min(Math.max(MIN_SIZE, newSizeRaw), 1000);

		if (newSizeRaw >= MIN_SIZE && newSizeRaw <= 1000) {
			this.element.style.width = `${newSize}px`;
			this.element.style.height = `${newSize}px`;

			const availableSpace = newSize - this.settings.padding * 2;

			const scaleFactor =
				availableSpace / (MIN_SIZE - this.settings.padding * 2);

			const newFontSize = Math.max(
				12,
				Math.min(
					this.initialFontSize * scaleFactor,
					availableSpace * 0.72
				)
			);

			// console.log("Scale factor calculation:", {
			// 	newSize,
			// 	padding: this.settings.padding,
			// 	availableSpace,
			// 	MIN_SIZE,
			// 	denominator: MIN_SIZE - this.settings.padding * 2,
			// 	scaleFactor,
			// });

			this.settings.fontSize = Math.round(newFontSize);
			this.element.style.fontSize = `${this.settings.fontSize}px`;

			this.settings.position.x = center.x - newSize / 2;
			this.settings.position.y = center.y - newSize / 2;

			this.updatePosition();
			this.updateContent();
		}
	}

	private onResizeEnd() {
		if (this.isResizing) {
			this.isResizing = false;
			this.resizeEdge = null;
			this.initialFontSize = null;
			this.initialMousePos = null;
			this.manager.saveAllBoxesSettingsToPluginSettings();
		}
	}

	// Drag handlers
	private onDragStart(e: MouseEvent | TouchEvent) {
		if (e instanceof MouseEvent) {
			const box = this.element.getBoundingClientRect();
			const edge = this.detectResizeEdge(e, box);
			if (edge) return; // Don't start dragging if we're on a resize handle
		}

		if (e instanceof TouchEvent && e.touches.length === 2) {
			// Don't start dragging if it's a pinch gesture
			return;
		}
		e.preventDefault();
		this.isDragging = true;

		const clientX =
			e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
		const clientY =
			e instanceof MouseEvent ? e.clientY : e.touches[0].clientY;

		this.dragOffset.x = clientX - this.settings.position.x;
		this.dragOffset.y = clientY - this.settings.position.y;
	}

	private onDragMove(e: MouseEvent | TouchEvent) {
		if (!this.isDragging) return;
		e.preventDefault();

		const clientX =
			e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
		const clientY =
			e instanceof MouseEvent ? e.clientY : e.touches[0].clientY;

		this.settings.position.x = clientX - this.dragOffset.x;
		this.settings.position.y = clientY - this.dragOffset.y;
		this.updatePosition();
		this.updateContent();
	}

	private onDragEnd() {
		if (this.isDragging) {
			this.isDragging = false;
			this.manager.saveAllBoxesSettingsToPluginSettings();
		}
	}

	// Content management
	public async updateContent() {
		const contentDiv = this.element.querySelector(
			".content"
		) as HTMLDivElement;
		if (!contentDiv) return;

		const todayNumber = await this.manager.getTodayNumber(this.settings);

		// Update styles
		contentDiv.style.fontSize = `${this.settings.fontSize}px`;
		contentDiv.style.fontWeight = this.settings.isBold ? "bold" : "normal";

		// Only update content if the number changed
		if (contentDiv.textContent !== todayNumber.toString()) {
			contentDiv.textContent = todayNumber.toString();
		}
	}

	// Public methods for manager to use
	public setZIndex(index: number) {
		this.element.style.zIndex = index.toString();
	}

	public getSettings(): BoxSettings {
		return { ...this.settings };
	}

	public updateSettings(newSettings: Partial<BoxSettings>) {
		this.settings = { ...this.settings, ...newSettings };
		this.updateStyle();
		this.updateContent();
	}

	// Pinch gesture handlers
	private onGestureStart(e: any) {
		e.preventDefault();
		this.initialFontSize = this.settings.fontSize;
	}

	private onGestureChange(e: any) {
		e.preventDefault();
		if (this.initialFontSize) {
			const newSize = Math.round(this.initialFontSize * e.scale);
			this.settings.fontSize = Math.min(Math.max(newSize, 8), 256);
			this.updateContent();
		}
	}

	private onGestureEnd(e: any) {
		e.preventDefault();
		this.initialFontSize = null;
		this.manager.saveAllBoxesSettingsToPluginSettings();
	}
}
