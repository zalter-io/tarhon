import {ObservedArray} from "../../observed-array.mjs";

const SELF_BUILD = Symbol.for("__self_build__");

/**
 *
 * @param element
 * @param attributeName
 * @returns {function(*): void}
 */
export const createAttrChangeHandler = (element, attributeName) => {
    const eventHandler = (event) => {
        if(event?.value?.bidirectional) {
            event.value.removeEventListener("change", eventHandler);
            // return; let it run once to get the initial value.
        }

        // this one has to be treated in a special way.
        if (event.eventTarget){
            const attributeValue = element.getAttribute(attributeName);
            if(attributeValue instanceof  ObservedArray && event.eventTarget instanceof  ObservedArray) {
                element.setAttribute(attributeName, event.eventTarget, false, event.detail.changeInfo);
            }
            else {
                element.setAttribute(attributeName, event.eventTarget);
            }

        }
        else element.setAttribute(attributeName, event.value);
    };
    return eventHandler
}

/**
 *
 * @param {HTMLElement} element
 * @param {string} attributeName
 * @param {boolean} withConditional
 * @returns {function(*): (undefined)}
 */
export const createBoolAttributeChangeHandler = (element, attributeName, withConditional = true) => {
    element.removeAttribute(attributeName);
    return (event) => {
        let actualValue = null;
        if (withConditional) {
            actualValue = event.eventTarget.conditionResults;
        } else {
            actualValue = typeof event?.value?.getValue === "function" ? event.value.getValue() : event.value;
        }
        element[attributeName] = !!(actualValue === true || actualValue === "true" || actualValue === attributeName || actualValue === "on");
    };
};

const idlAttributes = {
    value: {
        type: null,
        idlName: "value",
    },
    max: {
        type: Number,
        idlName: "max"
    },
    min: {
        type: Number,
        idlName: "min"
    },
    minlength: {
        type: Number,
        idlName: "minLength"
    },
    maxlength: {
        type: Number,
        idlName: "maxLength"
    }
    // TODO Complete the list.
};

/**
 *
 * @param {string} attributeName
 * @returns {boolean}
 */
export const isIdlAttribute = (attributeName) => !!(idlAttributes[attributeName] || attributeName.startsWith("aria"));

/**
 *
 * @param {string} attributeName
 * @returns {string|false}
 */
export const getIDLforAttribute = (attributeName) => idlAttributes[attributeName]?.idlName || (
        (attributeName.startsWith("aria") && attributeName.replace(/\-[a-z]/ig, (i) => i[1].toUpperCase()))
);

export const createIDLChangeHandler = (element, idlAttributeName, withConditional) => (event) => {
    const idlName = getIDLforAttribute(idlAttributeName);
    let actualValue = null;
    if (withConditional) {
        actualValue = event.eventTarget.conditionResults;
    } else {
        if (element.isObservedComponent) {
            if (element.attrs[idlAttributeName] !== event.value) {
                element.attrs[idlAttributeName] = event.value;
                return;
            }
        } else
            actualValue = typeof event?.value?.getValue === "function" ? event.value.getValue() : event.value;
    }
    element[idlName] = actualValue;
    element.setAttribute(idlAttributeName, actualValue, true);
};

/**
 *
 * @param {HTMLElement | Text | *} element
 * @returns {NodeChangeHandler} the change Handler function for the element.
 */
export const createNodeChangeHandler = (element) => {

    const f = function (event) {
        if (event.eventTarget instanceof ObservedArray) {
            // this is an array
            switch (event.eventTarget[SELF_BUILD].builtWith) {
                case "constructor":
                    element.data = event.eventTarget;
                    break;
                case "map":
                    // this usually is a container;
                    if (event.eventTarget[SELF_BUILD].container) {
                        const renderCallback = event.eventTarget[SELF_BUILD].buildCallback
                        const changeInfo = event.detail.changeInfo
                        if(changeInfo?.type === 'set') {
                            const newNode = renderCallback(event.detail.value);
                            const itemIndex = +changeInfo.key;

                            const currentNode = event.eventTarget[SELF_BUILD].container.childNodes[itemIndex];
                            if(currentNode) {
                                // replace child
                                event.eventTarget[SELF_BUILD].container.replaceChild(newNode, currentNode);
                            }
                            else {
                                // add child
                                event.eventTarget[SELF_BUILD].container.append(newNode)
                            }
                        } else  if(changeInfo?.type === 'delete') {
                            // remove child, only correct for rendered by tarhon.htmlT
                            const deleteIndex = event.detail.changeInfo.key;
                            if(deleteIndex === -1) {
                                throw new Error("Could not find the item to delete.")
                            }
                            const deleteNode = event.eventTarget[SELF_BUILD].container.childNodes[deleteIndex]
                            event.eventTarget[SELF_BUILD].container.removeChild(deleteNode);
                        }
                        else  {
                            event.eventTarget[SELF_BUILD].container.textContent = "";
                            event.eventTarget[SELF_BUILD].container.append(...event.eventTarget.map(renderCallback));
                        }
                        event.eventTarget.cleanAfterRender();
                    } else {
                        element.data = Array.from(event.eventTarget).join("");
                    }

                    break;
            }
        } else {
            element.data = event.value;
        }
    };

    return f;
};
