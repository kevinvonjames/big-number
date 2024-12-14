import { FloatingBoxManager } from "./FloatingBoxManager";
import { BoxSettings } from "./settings";

export class FloatingBox {
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

	constructor(
		manager: FloatingBoxManager,
		id: string,
		settings: BoxSettings
	) {
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

	private attachEventListeners() {
		// Mouse hover state
		this.element.addEventListener("mouseenter", () => {
			this.isMouseOver = true;
		});

		this.element.addEventListener("mouseleave", () => {
			if (!this.isResizing) {
				this.isMouseOver = false;
				this.element.style.cursor = "move";
			}
		});

		// Resizing
		this.element.addEventListener(
			"mousemove",
			this.setCursorStyle.bind(this)
		);
		this.element.addEventListener(
			"mousedown",
			this.onBoxMouseDown.bind(this)
		);
		document.addEventListener("mousemove", this.onResizing.bind(this));
		document.addEventListener("mouseup", this.onResizeEnd.bind(this));

		// Add both mouse and touch events for dragging
		this.element.addEventListener("mousedown", this.onDragStart.bind(this));
		this.element.addEventListener(
			"touchstart",
			this.onDragStart.bind(this),
			{
				passive: false,
			}
		);
		document.addEventListener("mousemove", this.onDragMove.bind(this));
		document.addEventListener("touchmove", this.onDragMove.bind(this), {
			passive: false,
		});
		document.addEventListener("mouseup", this.onDragEnd.bind(this));
		document.addEventListener("touchend", this.onDragEnd.bind(this));
	}

	public destroy() {
		// Remove document listeners first
		document.removeEventListener("mousemove", this.onDragMove.bind(this));
		document.removeEventListener("touchmove", this.onDragMove.bind(this));
		document.removeEventListener("mouseup", this.onDragEnd.bind(this));
		document.removeEventListener("touchend", this.onDragEnd.bind(this));
		document.removeEventListener("mousemove", this.onResizing.bind(this));
		document.removeEventListener("mouseup", this.onResizeEnd.bind(this));

		// Then remove the element itself
		if (this.element && this.element.parentNode) {
			this.element.parentNode.removeChild(this.element);
		}
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
		const RESIZE_HANDLE = 8; // pixels from edge
		const x = e.clientX - box.left;
		const y = e.clientY - box.top;

		const isLeft = x < RESIZE_HANDLE;
		const isRight = x > box.width - RESIZE_HANDLE;
		const isTop = y < RESIZE_HANDLE;
		const isBottom = y > box.height - RESIZE_HANDLE;

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
		const box = this.element.getBoundingClientRect();
		const edge = this.detectResizeEdge(e, box);

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
		if (
			!this.isResizing ||
			!this.initialFontSize ||
			!this.initialMousePos ||
			!this.resizeEdge
		)
			return;

		const box = this.element.getBoundingClientRect();
		const RESIZE_HANDLE = 8;
		const MIN_SIZE = 20 + RESIZE_HANDLE * 2;

		const center = {
			x: box.left + box.width / 2,
			y: box.top + box.height / 2,
		};

		let adjustedMouseX = e.clientX;
		let adjustedMouseY = e.clientY;

		if (this.resizeEdge.includes("w")) {
			adjustedMouseX -= RESIZE_HANDLE;
		} else if (this.resizeEdge.includes("e")) {
			adjustedMouseX += RESIZE_HANDLE;
		}

		if (this.resizeEdge.includes("n")) {
			adjustedMouseY -= RESIZE_HANDLE;
		} else if (this.resizeEdge.includes("s")) {
			adjustedMouseY += RESIZE_HANDLE;
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
					availableSpace * 0.8
				)
			);

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
			this.manager.saveSettings();
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
	}

	private onDragEnd() {
		if (this.isDragging) {
			this.isDragging = false;
			this.manager.saveSettings();
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
		this.manager.saveSettings();
	}
}
