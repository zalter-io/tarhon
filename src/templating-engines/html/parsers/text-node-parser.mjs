import {ObservedArray} from "../../../observed-array.mjs";
import {ConditionalObject} from "../conditional.mjs";
import {createNodeChangeHandler} from "../change-handlers-factories.mjs";
import {ObservedValue} from "../../../observed-value.mjs";

const SELF_BUILD = Symbol.for("__self_build__");
const matchRegEX = /(📇[_a-zA-Z0-9]+📇)/ig;

export const textNodeParser = (element, uniqueIdentifiers, trim) => {

    const testData = trim ? element.data.trim() : element.data;

    const executedMatch = testData.match(matchRegEX);

    if (executedMatch) {
        let copiedData = testData;
        const textNodes = [];

        for (let matchedItem of executedMatch) {
            let index = copiedData.indexOf(matchedItem);

            if (index > 0) {
                // need to split the part before.
                const textNode = document.createTextNode(copiedData.substring(0, index));
                textNodes.push(textNode);

                copiedData = copiedData.substring(index);
            }

            copiedData = copiedData.substring(matchedItem.length);

            if (typeof uniqueIdentifiers[matchedItem] !== "undefined") {
                if (uniqueIdentifiers[matchedItem] instanceof Array) {
                    if (uniqueIdentifiers[matchedItem] instanceof ObservedArray && uniqueIdentifiers[matchedItem][SELF_BUILD].returnsStrings) {
                        const matchedTextNode = document.createTextNode(`${uniqueIdentifiers[matchedItem]}`);

                        if (typeof uniqueIdentifiers[matchedItem] === "object" && typeof uniqueIdentifiers[matchedItem].addEventListener === "function") {
                            uniqueIdentifiers[matchedItem].addEventListener("change", createNodeChangeHandler(matchedTextNode));
                        }

                        textNodes.push(matchedTextNode);
                    } else {
                        // TODO: Try and make it without using a container... for now create a parent to trigger with.
                        let container = null;

                        if (textNodes.length) {
                            console.warn("You should not use template arrays in elements with other content.");
                            container = document.createElement("dom-repeat");
                            container.append(...uniqueIdentifiers[matchedItem]);
                            textNodes.push(container);
                        } else {
                            container = element.parentNode;
                            textNodes.push(...uniqueIdentifiers[matchedItem]);
                        }
                        if (uniqueIdentifiers[matchedItem] instanceof ObservedArray) {
                            uniqueIdentifiers[matchedItem][SELF_BUILD].container = container;

                            if (typeof uniqueIdentifiers[matchedItem] === "object" && typeof uniqueIdentifiers[matchedItem].addEventListener === "function") {
                                const handler = createNodeChangeHandler(container);
                                handler.target = uniqueIdentifiers[matchedItem];
                                uniqueIdentifiers[matchedItem].addEventListener("change", handler);
                            }
                        }
                    }
                } else {
                    if (uniqueIdentifiers[matchedItem] instanceof ConditionalObject) {
                        textNodes.push(...uniqueIdentifiers[matchedItem].template);
                    } else if (uniqueIdentifiers[matchedItem] instanceof DocumentFragment) {
                        textNodes.push(uniqueIdentifiers[matchedItem]);
                    } else if (uniqueIdentifiers[matchedItem] instanceof ObservedValue && uniqueIdentifiers[matchedItem].getValue() instanceof DocumentFragment) {
                        let childFragment = uniqueIdentifiers[matchedItem].getValue();
                        textNodes.push(childFragment);
                        uniqueIdentifiers[matchedItem].addEventListener("change", (() => {
                            let matchedParent = element.parentElement;
                            let currentChildren = Array.from(childFragment.childNodes);
                            let oldFragment = childFragment;
                            return (event) => {
                                const newFragment = event.value;
                                if (oldFragment === newFragment) {
                                    return;
                                }
                                const savedChildren = Array.from(newFragment.childNodes);
                                currentChildren.map((childNode, idx) => {
                                    // remove them all from the document and re-append them to original template
                                    if (idx < currentChildren.length - 1) {
                                        element.parentElement.removeChild(childNode);
                                        oldFragment.append(childNode);
                                    }
                                });
                                const lastChild = currentChildren[currentChildren.length - 1];
                                currentChildren = savedChildren;
                                matchedParent.replaceChild(newFragment, lastChild);
                                oldFragment.append(lastChild);
                                oldFragment = newFragment;
                            };
                        })());
                    } else {
                        const matchedTextNode = document.createTextNode(`${uniqueIdentifiers[matchedItem]}`);

                        if (typeof uniqueIdentifiers[matchedItem] === "object" && typeof uniqueIdentifiers[matchedItem].addEventListener === "function") {
                            uniqueIdentifiers[matchedItem].addEventListener("change", createNodeChangeHandler(matchedTextNode));
                        }

                        textNodes.push(matchedTextNode);
                    }
                }
            }
        }

        textNodes.forEach((item) => {
            element.parentNode.insertBefore(item, element);
        });

        // DO NOT remove this element as it interferes with tree walking.
        // if there is anything remaining it goes in here otherwise the original text node remains empty (zero impact)
        element.data = copiedData;
    }

};
