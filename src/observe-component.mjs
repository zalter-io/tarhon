import {ObservedObject} from "./observed-object.mjs";
import {hasAdoptedStyles} from "./templating-engines/css/observed-css.mjs";
import {ObservedValue} from "./observed-value.mjs";
import {ObservedTarget} from "./observed-target.mjs";
import {ObservedArray} from "./observed-array.mjs";
// import { Context } from './context.mjs';

const __INTERNAL = Symbol();
const INTERNAL_USAGES_SYMBOL = Symbol.for("__internalUsages__");

/**
 * @typedef ObserveComponentConfig
 * @property {"closed"|"open"|"none"} useShadow = closed
 */

/**
 *
 * @param TargetElement
 * @param {ObserveComponentConfig} config
 * @return {{new(): T, prototype: T}}
 */
export function observeComponent(TargetElement, config = {}) {
    if (typeof TargetElement.prototype[Symbol.for("requestRender")] === "function") {
        throw new Error("Can not observeComponent from another observeComponent");
    }
    return class T extends TargetElement {
        #shadowElement = null;
        #requestedAnimationFrameHandle = null;
        #animationFrameHandler = () => {
            this.#requestedAnimationFrameHandle = null;
            this.render();
        };

        constructor() {
            super();
            // const shadowRoot = ElementInternals.attachInternals();
            Object.defineProperty(this, "isObservedComponent", {
                configurable: false,
                writable: false,
                enumerable: true,
                value: true
            });
            Object.defineProperty(this, "state", {
                configurable: false,
                writable: true,
                enumerable: false,
                value: new ObservedObject()
            });
            Object.defineProperty(this, "attrs", {
                configurable: false,
                writable: false,
                enumerable: false,
                value: new ObservedObject()
            });
            this.state[INTERNAL_USAGES_SYMBOL].parentElement = this;
            this.attrs[INTERNAL_USAGES_SYMBOL].parentElement = this;
            const attributeChangeHandler = (attributeName) => (event) => {
                this.dispatchEvent(new CustomEvent(`attr-mutation-${attributeName}`, {
                    detail: {
                        value: event.value,
                        oldValue: event.oldValue
                    }
                }));
            };
            if (typeof this.constructor.observedAttributes !== "undefined") {
                this.constructor
                        .observedAttributes
                        .map((attributeName) => {
                            // if(typeof thisPrototype.attributeName){}
                            let attributeValue = null;
                            if (attributeName === "checked" || attributeName === "disabled" || attributeName === "readonly") {
                                attributeValue = this.hasAttribute(attributeName);
                            } else {
                                attributeValue = super.getAttribute(attributeName);
                            }

                            const observable = new ObservedValue(attributeValue);

                            observable.addEventListener("changeValue", attributeChangeHandler(attributeName));
                            this.attrs[attributeName] = observable;

                            Object.defineProperty(this, attributeName, {
                                configurable: false,
                                enumerable: true,
                                set: (value) => {
                                    this.setAttribute(attributeName, value);
                                },
                                get: () => {
                                    return this.attrs[attributeName] instanceof ObservedValue ? this.attrs[attributeName].getValue() : this.attrs[attributeName];
                                }
                            });
                        });

            }
            this.dispatchEvent(new CustomEvent("constructed"));
        }

        /**
         * Memoized ShadowRoot getter. Can be replaced or configured.
         * @return {ShadowRoot|null|T}
         */
        get _renderRoot() {
            if (this.#shadowElement) {
                return this.#shadowElement;
            }
            switch (config?.useShadow) {
                case "none":
                    return (this.#shadowElement = this);
                case "open":
                    return (this.#shadowElement = this.attachShadow({mode: "open"}));
                case "closed":
                    // fallthrough
                default:
                    // fallthrough

            }
            return this.#shadowElement = this.attachShadow({mode: "closed"});
        }

        setAttribute(attributeName, value, onlySuper = false, changeInfo={}) {
            if(onlySuper) return super.setAttribute(attributeName, value);

            if ((
                    value instanceof ObservedTarget
                    || value instanceof ObservedObject
                    || value instanceof ObservedArray
                    || value instanceof ObservedValue
            ) && value.bidirectional) {
                this.attrs[attributeName] = value;
            } else {
                const currentAttValue = this.attrs[attributeName];
                //

                if (typeof this.constructor.observedAttributes !== "undefined" && this.constructor.observedAttributes.includes(attributeName)) {
                    if (attributeName === "checked" || attributeName === "disabled" || attributeName === "readonly")
                        this.attrs[attributeName] = (value === "on" || value === "true" || value === attributeName || value === true || value === "");
                    else  if(currentAttValue instanceof  ObservedArray) {
                        if(changeInfo.type === 'set' || changeInfo.type === 'push') {
                            currentAttValue[changeInfo.key] = value[changeInfo.key];
                        } else if(changeInfo.type === 'delete') {
                            currentAttValue.delete(changeInfo.id, changeInfo.identifier);
                        } else  {
                            this.attrs[attributeName] = value;
                        }
                    }
                    else
                        this.attrs[attributeName] = value;
                }
            }

            if (typeof value === "string" || typeof value === "number" || typeof value === "boolean"
                    || value instanceof ObservedValue
            ) {
                return super.setAttribute(attributeName, `${value}`);
            } else {
                return super.setAttribute(attributeName, undefined);
            }
        }

        appendValueToArrayAttribute(attributeName, value) {
            if(this.attrs[attributeName] instanceof  ObservedArray) {
                this.attrs[attributeName].push(value);
            }
        }



        getAttribute(name, callGetValue = true) {
            if (typeof this.constructor.observedAttributes !== "undefined" && this.constructor.observedAttributes.includes(name)) {
                return (callGetValue && typeof this.attrs[name].getValue === "function") ? this.attrs[name].getValue() : this.attrs[name];
            }
            return super.getAttribute(name);
        }

        removeAttribute(attributeName, onlySuper = false) {
            if (!onlySuper && typeof this.constructor.observedAttributes !== "undefined" && this.constructor.observedAttributes.includes(attributeName)) {
                if (attributeName === "checked" || attributeName === "disabled" || attributeName === "readonly")
                    this.attrs[attributeName] = false;
                else
                    this.attrs[attributeName] = "";
            }
            return super.removeAttribute(attributeName);
        }

        get [Symbol.for("renderRequested")]() {
            return this.#requestedAnimationFrameHandle;
        }

        [Symbol.for("requestRender")]() {
            if (this.#requestedAnimationFrameHandle) {
                cancelAnimationFrame(this.#requestedAnimationFrameHandle);
            }
            this.#requestedAnimationFrameHandle = requestAnimationFrame(this.#animationFrameHandler);
        }

        [Symbol.for("cancelRerender")]() {
            if (this.#requestedAnimationFrameHandle) {
                cancelAnimationFrame(this.#requestedAnimationFrameHandle);
            }
        }

        get isObservedComponent() {
            return true;
        }

        // This should not be necessary anymore? Commenting it for now.
        // /**
        //  * @abstract Call this with super.attributeChangedCallback in your own (if you implement it)
        //  * @param attributeName
        //  * @param oldValue
        //  * @param newValue
        //  */
        // attributeChangedCallback(attributeName, oldValue, newValue) {
        //     console.log("inside attribute changed callback ... so this happens AFTER the attribute has been changed not prior", {attributeName, oldValue, newValue});
        //     if (attributeName === "checked" || attributeName === "disabled" || attributeName === "readonly")
        //         this.attrs[attributeName] = (newValue === "on" || newValue === "true" || newValue === attributeName || newValue === true || newValue === "");
        //     else
        //         this.attrs[attributeName] = newValue;
        // }

        connectedCallback() {
            if (this.notificationList && this.notificationList instanceof Set) {
                for (const notifiedComponent of this.notificationList) {
                    notifiedComponent.notify(this);
                }
            }
            if (this._renderRoot instanceof ShadowRoot) {
                this.renderStyle(...[
                    this.constructor.style?.constructed, this.ownStyle?.constructed
                ].filter(i => !!i));
            } else {
                if (this.constructor.style || this.ownStyle) {
                    console.error("Components without a shadowRoot can not have local defined styles. Use classes defined above, instead!");
                }
            }
        }

        disconnectedCallback(...args) {
            typeof super.disconnectedCallback === "function" && super.disconnectedCallback(...args);
        }

        /**
         * @abstract must be implemented
         * @param {T} notificationSource
         */
        notify(notificationSource) {

        }

        renderStyle(...styles) {
            if (hasAdoptedStyles()) {
                this._renderRoot.adoptedStyleSheets = [...styles];
            } else {
                for (let style of styles) {
                    if (typeof style === "function") {
                        const styleElement = document.createElement("style");
                        styleElement.dataset["tarhonStyle"] = 1;
                        this._renderRoot.append(styleElement);
                        style(styleElement.sheet);
                    }
                }
            }
        }

        // /**
        //  * @abstract Must be implemented.
        //  * @returns {string[]}
        //  */
        // static get observedAttributes(){
        //     return [];
        // }
        /**
         * @abstract Must be implemented.
         */
        render() {
            if (this._renderRoot.firstChild) {
                const savedNodes = Array.from(this._renderRoot.childNodes);
                for (let element of savedNodes) {
                    if (!(element.localName === "style" && element.dataset?.["tarhonStyle"] === 1)) {
                        this._renderRoot.removeChild(element);
                    }
                }
            }
            this.state[INTERNAL_USAGES_SYMBOL].rendered = true;
        }

        findContext(ctx, contextComponent) {
            return T.findFirstParent(contextComponent?.tagName || "tarhon-context", contextComponent?.contextAttribute !== undefined ? contextComponent?.contextAttribute : "ctx", // allows null
                    ctx, this);
        }

        /**
         *
         * @param {string} tagName
         * @param {string} attributeName
         * @param {string} attributeValue
         * @param {HTMLElement | ShadowRoot} startingElement
         * @return {null|*}
         */
        static findFirstParent(tagName, attributeName, attributeValue, startingElement) {
            if (startingElement === null) {
                return null;
            }

            if (startingElement.localName === tagName && (!attributeName || startingElement.getAttribute(attributeName) === attributeValue)) {
                return startingElement;
            }

            if (startingElement instanceof ShadowRoot) {
                return T.findFirstParent(tagName, attributeName, attributeValue, startingElement.host);
            }

            return T.findFirstParent(tagName, attributeName, attributeValue, startingElement.parentNode);
        }

        addToParentNotificationList(targetComponentName) {
            const targetComponent = this.constructor.findFirstParent(targetComponentName, undefined, undefined, this);
            if (targetComponent.isConnected) {
                setTimeout(() => this.notify(targetComponent), 0);
            } else {
                if (!targetComponent.notificationList || !(targetComponent.notificationList instanceof Set)) {
                    targetComponent.notificationList = new Set();
                }
                targetComponent.notificationList.add(this);
            }
        }
    };
}
