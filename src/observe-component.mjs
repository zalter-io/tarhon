import { ObservedObject } from './observed-object.mjs';
import { hasAdoptedStyles } from './templating-engines/css/observed-css.mjs';
import { ObservedValue } from './observed-value.mjs';

const __INTERNAL = Symbol();
const INTERNAL_USAGES_SYMBOL = Symbol.for('__internalUsages__');

/**
 * @typedef ObserveComponentConfig
 * @property {"closed"|"open"|"none"} useShadow = closed
 */

/**
 *
 * @param TargetElement
 * @param config
 * @return {{new(): T, prototype: T}}
 */
export function observeComponent(TargetElement, config = {}) {
  return class T extends TargetElement {
    constructor() {
      super();
      Object.defineProperty(this, 'state', {
        configurable: false,
        writable: false,
        enumerable: false,
        value: new ObservedObject()
      });
      Object.defineProperty(this, 'attrs', {
        configurable: false,
        writable: false,
        enumerable: false,
        value: new ObservedObject()
      });
      Object.defineProperty(this, __INTERNAL, {
        configurable: false,
        writable: false,
        enumerable: false,
        value: {
          requestedAnimationFrame: null,
          createdShadowElement: null,
          animationFrameHandler: () => {
            this[__INTERNAL].requestedAnimationFrame = null;
            this.render();
          }
        }
      });

      this.state[INTERNAL_USAGES_SYMBOL].parentElement = this;

      if (typeof Object.getPrototypeOf(this).constructor.observedAttributes !== 'undefined') {
        Object
          .getPrototypeOf(this)
          .constructor
          .observedAttributes
          .map((attributeName) => {
            // if(typeof thisPrototype.attributeName){}
            this.attrs[attributeName] = new ObservedValue(this.getAttribute(attributeName));

            Object.defineProperty(this, attributeName, {
              configurable: false,
              enumerable: true,
              set: (value) => {
                this.setAttribute(attributeName, value);
              },
              get: () => {
                return this.attrs[attributeName];
              }
            });
          });

      }
    }

    /**
     * Memoized ShadowRoot getter. Can be replaced or configured.
     * @return {ShadowRoot|null|T}
     */
    get renderRoot() {
      if (this[__INTERNAL].createdShadowElement) {
        return this[__INTERNAL].createdShadowElement;
      }
      switch (config?.useShadow) {
        case 'none':
          return (this[__INTERNAL].createdShadowElement = this);
        case 'open':
          return (this[__INTERNAL].createdShadowElement = this.attachShadow({ mode: 'open' }));
        case 'closed':
        // fallthrough
        default:
        // fallthrough

      }
      return this[__INTERNAL].createdShadowElement = this.attachShadow({ mode: 'closed' });
    }

    setAttribute(name, value) {
      if (typeof value === 'string') {
        return super.setAttribute(name, value);
      }
      if (
        typeof Object.getPrototypeOf(this).constructor.observedAttributes !== 'undefined' &&
        Object
          .getPrototypeOf(this)
          .constructor
          .observedAttributes
          .includes(name)
      ) {
        return this.attrs[name] = value;
      }
    }

    removeAttribute(name) {
      if (
        typeof Object.getPrototypeOf(this).constructor.observedAttributes !== 'undefined' &&
        Object
          .getPrototypeOf(this)
          .constructor
          .observedAttributes
          .includes(name)
      ) {
        this.attrs[name] = '';
        return;
      }
      return super.removeAttribute(name);
    }

    get [Symbol.for('renderRequested')]() {
      return this[__INTERNAL].requestedAnimationFrame;
    }

    [Symbol.for('requestRender')]() {
      if (this[__INTERNAL].requestedAnimationFrame) {
        cancelAnimationFrame(this[__INTERNAL].requestedAnimationFrame);
      }

      this[__INTERNAL].requestedAnimationFrame =
        requestAnimationFrame(this[__INTERNAL].animationFrameHandler);
    }

    /**
     * @abstract Call this with super.attributeChangedCallback in your own (if you implement it)
     * @param name
     * @param oldValue
     * @param newValue
     */
    attributeChangedCallback(name, oldValue, newValue) {
      this.attrs[name] = newValue;
    }

    connectedCallback() {
      if (this.renderRoot instanceof ShadowRoot) {
        console.log("Got in render style.");
        this.renderStyle(...[
          Object.getPrototypeOf(this)?.constructor?.style?.constructed,
          this.ownStyle?.constructed
        ].filter(i => !!i));
      } else {
        if (Object.getPrototypeOf(this)?.constructor?.style || this.ownStyle) {
          console.error(
            'Components without a shadowRoot can not have local defined styles. Use classes defined above, instead!'
          );
        }
      }
    }

    renderStyle(...styles) {
      if (hasAdoptedStyles()) {
        this.renderRoot.adoptedStyleSheets = [...styles];
      } else {
        for (let style of styles) {
          if (typeof style === 'function') {
            const styleElement = document.createElement('style');
            styleElement.dataset['tarhonStyle'] = 1;
            this.renderRoot.append(styleElement);
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
      if (this.renderRoot.firstElementChild) {
        for (let element of this.renderRoot.childNodes) {
          if (!(element.localName === 'style' && element.dataset?.['tarhonStyle'] === 1)) {
            this.renderRoot.removeChild(element);
          }
        }
      }
      this.state[INTERNAL_USAGES_SYMBOL].rendered = true;
    }
  };
}
