import {ConditionalObject} from "../conditional.mjs";
import {
    createAttrChangeHandler,
    createBoolAttributeChangeHandler, createIDLChangeHandler, getIDLforAttribute, isIdlAttribute
} from "../change-handlers-factories.mjs";
import {ObservedTarget} from "../../../observed-target.mjs";
import {ObservedArray} from "../../../observed-array.mjs";
import {ObservedValue} from "../../../observed-value.mjs";
import {ObservedObject} from "../../../observed-object.mjs";

let autoloadSet = false;
let autoloadFn = () => {
};

export const hasAutoLoad = () => !!autoloadSet;
export const setAutoload = (autoLoadFunction) => {
    autoloadSet = true;
    autoloadFn = autoLoadFunction;
};

export const elementNodeParser = async (element, uniqueIdentifiers, oldElement = null) => {
    if (element[Symbol.toStringTag] === "HTMLElement") {
        const tag = element.tagName.toLowerCase();
        const isMaybeCustom = tag.includes("-");
        if (isMaybeCustom && !customElements.get(tag)) {
            if (autoloadSet) {
                autoloadFn(tag);
                await customElements.whenDefined(tag);
            } else
                console.warn("Could have autoloaded ", tag, element);
        }
        if (isMaybeCustom && !element.isObservedComponent) {
            // this element has not actually been loaded
            await new Promise((resolve, reject) => {
                element.addEventListener("constructed", (event) => {
                    resolve();
                }, {once: true});
            });
        }
    }
    const capturedAttributes = [...element.attributes];

    for (const attribute of capturedAttributes) {
        const valueCopy = uniqueIdentifiers[attribute.value];
        if (attribute.value.startsWith("📇") && attribute.value.endsWith("📇")) {
            // this is an attribute we care about.
            if (typeof valueCopy !== "undefined") {
                if (typeof valueCopy === "function") {
                    if (attribute.name.startsWith("@")) {
                        const eventName = attribute.name.replace("@", "");
                        element.addEventListener(eventName, valueCopy);
                        element.removeAttribute(attribute.name);
                    } else {
                        element.setAttribute(attribute.name, valueCopy(element));
                    }
                } else {
                    if (isIdlAttribute(attribute.name)) {
                        const idlName = getIDLforAttribute(attribute.name);
                        if (
                                valueCopy instanceof ObservedTarget
                                || valueCopy instanceof ObservedObject
                                || valueCopy instanceof ObservedArray
                                || valueCopy instanceof ObservedValue
                        ) { // it's some observable.
                            // First check whether it is a bidirectional.
                            if (valueCopy.bidirectional) {
                                element[idlName] = valueCopy;
                            } else {
                                const idlChangeHandler = createIDLChangeHandler(element, idlName, valueCopy instanceof ConditionalObject);
                                valueCopy.addEventListener("change", idlChangeHandler);
                                element[idlName] = valueCopy;
                                idlChangeHandler(valueCopy instanceof ConditionalObject
                                        ? {eventTarget: valueCopy}
                                        : {value: valueCopy});
                            }
                        } else {

                            // the simple equality check is intentional here to allow autoconversions for idls.
                            (element[idlName] != valueCopy) && (element[idlName] = valueCopy);
                            // it's highly likely that this is a re-render otherwise this would have been done on the other branch.
                        }
                        element.setAttribute(attribute.name, valueCopy, true);
                    } else if (attribute.name === "checked" || attribute.name === "disabled" || attribute.name === "readonly") {
                        if (
                                valueCopy instanceof ObservedTarget
                                || valueCopy instanceof ObservedObject
                                || valueCopy instanceof ObservedArray
                                || valueCopy instanceof ObservedValue
                        ) {
                            const attributeChangeHandler = createBoolAttributeChangeHandler(
                                    element,
                                    attribute.name,
                                    valueCopy instanceof ConditionalObject
                            );
                            valueCopy.addEventListener("change", attributeChangeHandler);
                            attributeChangeHandler(
                                    valueCopy instanceof ConditionalObject
                                            ? {eventTarget: valueCopy}
                                            : {value: valueCopy}
                            );
                        } else {
                            element.setAttribute(attribute.name, valueCopy); // it's already decided that it's not undefined.
                        }
                    } else {
                        if (
                                valueCopy instanceof ObservedTarget
                                || valueCopy instanceof ObservedObject
                                || valueCopy instanceof ObservedArray
                                || valueCopy instanceof ObservedValue
                        ) {
                            valueCopy.addEventListener(
                                    "change",
                                    createAttrChangeHandler(element, attribute.name)
                            );
                        }
                        element.setAttribute(attribute.name, valueCopy);
                    }
                }
            } else { // since it's undefined now, it must have been removed or made undefined to remove it as this can be a rerender.
                element.removeAttribute(attribute.name);
            }
        }
    }
};

