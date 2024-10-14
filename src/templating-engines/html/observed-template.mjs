import {textNodeParser} from "./parsers/text-node-parser.mjs";
import {elementNodeParser} from "./parsers/element-node-parser.mjs";
import {LazyStyle} from "../css/observed-css.mjs";
import {observeComponent} from "../../observe-component.mjs";


const createElementFactory = (content) => {
    let currentElement = content;

    return {
        replaceElement(newElement) {
            currentElement.parentNode?.replaceChild(newElement, currentElement);
            currentElement = newElement;
        },
        removeCurrentElement() {
            const elementToBeRemoved = currentElement;
            const parentNode = elementToBeRemoved.parentNode;
            if (elementToBeRemoved.previousSibling) {
                currentElement = elementToBeRemoved.previousSibling;
            } else {
                currentElement = parentNode;
            }
            parentNode.removeChild(elementToBeRemoved);
        },
        next() {
            let element = currentElement.firstChild;

            if (element) {
                currentElement = element;
                return element;
            }

            element = currentElement.nextSibling;

            if (element) {
                currentElement = element;
                return element;
            }

            while ((element = currentElement.parentNode) && element !== content && (currentElement =
                    element)) {
                element = currentElement.nextSibling;

                if (element) {
                    currentElement = element;
                    return element;
                }
            }
        }
    };
};

export const observedTemplateFactory = (trim = false) => (stringParts, ...vars) => {
    const uniqueIdentifiers = {};

    const htmlString = stringParts.reduce((acc, item, idx) => {
        let returnedString = `${acc}${item}`;

        if (typeof vars[idx] !== "undefined") {
            const uniqueIdx = `📇${idx}__${Math.floor(Math.random() * 1e15)}📇`;
            uniqueIdentifiers[uniqueIdx] = vars[idx];
            returnedString += uniqueIdx;
        }

        return returnedString;
    }, "");

    const templateElement = document.createElement("template");
    templateElement.innerHTML = htmlString;

    const content = templateElement.content;
    const elementFactory = createElementFactory(content);
    let element = null;
    // eslint-disable-next-line no-cond-assign
    while (element = elementFactory.next()) {
        switch (element.nodeType) {
            case Node.ELEMENT_NODE:
                elementNodeParser(element, uniqueIdentifiers).catch((e) => {
                    console.error(e); // for now this is good enough let's see it in action.,
                });
                break;
            case Node.TEXT_NODE:
                if (trim && element.data.trim() === "") {
                    elementFactory.removeCurrentElement();
                } else
                    textNodeParser(element, uniqueIdentifiers, trim);
                break;
        }
    }

    return content;
};
let count = 0;
class AdHoc extends observeComponent(HTMLElement){
    constructor() {
        super();
        this.render();
    }
    render() {
        super.render();
        this._renderRoot.appendChild(this.deferredRenderItems || observedTemplateFactory(true)`<slot></slot>`)
    }
}
customElements.define('ad-hoc', AdHoc);
export const observedTemplateAdhoc = (...args) => {
    const outsideElement = document.createElement("template");
    outsideElement.innerHTML = '<ad-hoc></ad-hoc>';
    let adHoc = outsideElement.content.childNodes[0];
    adHoc.deferredRenderItems = observedTemplateFactory(true)(...args);
    Object.defineProperty(outsideElement.content,"adoptedStyleSheets", {
        get: () => {
            return adHoc.ownStyle;
        },
        set: (v) => {
            adHoc.ownStyle = v;
            if(adHoc.isConnected){
                adHoc.renderStyle(adHoc.ownStyle);
            }
        }
    });
    return outsideElement.content;
}
/**
 * Template function that returns a DocumentFragment and supports Observed items. Will not rerender when observed items change value.
 * When using arrays, try to put them in a container element alone(no other elements around them not even empty text).
 * @param stringParts
 * @param vars
 * @returns {DocumentFragment}
 */
export const observedTemplate = observedTemplateFactory(false);
export const observedTrimmedTemplate = observedTemplateFactory(true);
