const INTERNAL_USAGES_SYMBOL = Symbol.for("__internalUsages__");

/**
 * @property {*} oldValue
 * @property {*} eventTarget
 * @property {*} value;
 */
class ObservedChangeEvent extends CustomEvent {
	/**
	 *
	 * @param {string} eventName
	 */
	constructor(eventName, detail) {
		super(eventName, {
			detail: {
				value: detail.value,
				oldValue: detail.oldValue,
				eventTarget: detail.eventTarget,
                changeInfo: detail.changeInfo
			}
		});
	}

	set value(value) {
		this.detail.value = value;
	}

	get value() {
		return this.detail.value;
	}

	set oldValue(value) {
		this.detail.oldValue = value;
	}

	get oldValue() {
		return this.detail.oldValue;
	}

	set eventTarget(value) {
		this.detail.eventTarget = value;
	}

	get eventTarget() {
		return this.detail.eventTarget;
	}
}

/**
 * @typedef {Function} eventHandler
 * @param {ObservedChangeEvent} event
 * @property {object} target
 * @returns {boolean} Return value is ignored for the purpose of this object.
 */

/**
 * @typedef {Object} InternalUsageObject
 * @property {Object<string, Array>} eventListeners
 * @property {HTMLElement} parentElement
 * @property {boolean} rendered
 */
/**
 * Observed Target mixin
 * @param {*} TargetClass
 */
export function observeTarget(TargetClass) {
	/**
	 * Extended Target class
	 * @property {object} [INTERNAL_USAGES_SYMBOL]
	 * @typedef ExtendedTargetClass
	 */
	return class extends TargetClass {
        #bidirectional = false;
		/**
		 * Create a change event
		 * @param {*} value A value for the value property of the event
		 * @param {*} oldValue A value for the event oldValue property (the value it changed FROM)
		 * @param {*} eventTarget The target object on which the change happened.
		 * @returns {ObservedChangeEvent}
		 */
		static _createChangeValueEvent(value = null, oldValue = null, eventTarget = null, changeInfo ) {
			return new ObservedChangeEvent("changeValue", {
				value,
				oldValue,
				eventTarget,
                changeInfo
			});
		}

		/**
		 * @returns {InternalUsageObject}
		 */
		static _initInternalUsage() {
			return {
				eventListeners: {
					changeValue: new Set()
				},
				parentElement: null,
				rendered: false,
                animationEvents: [],
			};
		}

		/**
		 * Static method that does the actual dispatching.
		 * @note This is made so that we avoid overloading the stack and referencing in each object.
		 * @param internalUsages
		 * @param event
		 */
		static _dispatchStatic(internalUsages, event, keepAnimations = false) {

            const f = () => {
                if (internalUsages.eventListeners && internalUsages.eventListeners[event.type] instanceof Set) {
					for (let handler of internalUsages.eventListeners[event.type]) {
						handler(event);
					}
				}
				internalUsages.animationFrame = null;
			};



			if (window && typeof window.requestAnimationFrame==="function") {
				if (!keepAnimations && internalUsages.animationFrame) {
					console.info('deleted old animation frame. Will only run a single event.');
					window.cancelAnimationFrame(internalUsages.animationFrame);
				}

				internalUsages.animationFrame = window.requestAnimationFrame(f);
			} else {
				if (typeof setImmediate==="function") {
					setImmediate(f);
				} else {
					throw new Error("No way to run immediate events.");
				}
			}
		}
        constructor() {
            super();
            const makeBidirectional = () => {
                this.#bidirectional = true;
            }
            const removeBidirectional = () => {
                this.#bidirectional = false;
            }
            const identity = () => true;
            Object.defineProperties(this, {
                bidirectional: {
                    enumerable: false,
                    get: () => this.#bidirectional,
                    set: identity
                },
                makeBidirectional: {
                    enumerable: false,
                    get: () =>  makeBidirectional,
                    set: identity
                },
                removeBidirectional: {
                    enumerable: false,
                    get: () => removeBidirectional,
                    set: identity
                }
            })
        }
		/**
		 * Adds an event listener / handler for the event with that name.
		 * @note Due to the fact that change is a natural event for certain elements, change event
		 *    listeners will be modified to be called "changeValue".
		 * @param {string} eventName
		 * @param {eventHandler} eventHandler
		 * @param {boolean} override
		 */
		addEventListener(eventName, eventHandler, override = false) {
			const internalEventName = eventName==="change" && !override ? "changeValue":eventName;
			if (
					typeof this[INTERNAL_USAGES_SYMBOL].eventListeners[internalEventName]!=="object" ||
					!(this[INTERNAL_USAGES_SYMBOL].eventListeners[internalEventName] instanceof Set)
			) {
				this[INTERNAL_USAGES_SYMBOL].eventListeners[internalEventName] = new Set();
			}

			this[INTERNAL_USAGES_SYMBOL].eventListeners[internalEventName].add(eventHandler);
		}

		/**
		 *
		 * @param {string} eventName
		 * @param {eventHandler} eventHandler
		 * @param {boolean} override
		 */
		removeEventListener(eventName, eventHandler, override) {
			const internalEventName = eventName==="change" && !override ? "changeValue":eventName;

			if (
					this[INTERNAL_USAGES_SYMBOL].eventListeners[internalEventName]
					&& this[INTERNAL_USAGES_SYMBOL].eventListeners[internalEventName] instanceof Set
			) {
				this[INTERNAL_USAGES_SYMBOL].eventListeners[internalEventName].delete(eventHandler);
			}
		}

		/**
		 * Dispatches an event.
		 * @param event
		 */
		dispatchEvent(event) {
			if (this[INTERNAL_USAGES_SYMBOL]) {
				this.constructor._dispatchStatic(this[INTERNAL_USAGES_SYMBOL], event);
			} // otherwise it's either still in constructor or simply doesn't even make sense
		}



	};
}

/**
 * @type ExtendedTargetClass
 */
export class ObservedTarget extends observeTarget(EventTarget) {
}
