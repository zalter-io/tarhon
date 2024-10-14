import {ObservedValue} from "./observed-value.mjs";
import {observeTarget} from "./observed-target.mjs";

/**
 * Symbol used to access the internal usage
 * @type {symbol}
 */
const INTERNAL_USAGES_SYMBOL = Symbol.for("__internalUsages__");
const SELF_BUILD = Symbol.for("__self_build__");
const INTERNAL_ARRAY = Symbol();

/**
 * ObservedArray with proxy hooks.
 * @todo allow the user to extend other types of arrays as the map function below suggests.
 * @see Due to the way this works with its internal values and the way they're replaced by certain functions, one should proceed with caution
 *  when removing elements that they converted to ObservedValue and were used in Templates. The templates make a ref count increase to the
 *  ObservedValue and keep them. For the time being I don't have a good solution to the problems caused by it, thus you should proceed with caution
 *  in order to not run into a serious memory leak with this.
 */
export class ObservedArray extends observeTarget(Array) {
	/**
	 * @returns {ObservedArray} a Proxy decorated array.
	 */
	constructor() {
		super(...arguments);
		let internalUsages = ObservedArray._initInternalUsage(); // basically allow setting stuff here.
		const selfBuild = {
			builtWith: "constructor",
			buildCallback: null,
			container: null
		};

		return new Proxy(this, {
			/**
			 * Get Handler for ObservedArray Proxy.
			 * @param {*} target
			 * @param {string|symbol} key
			 * @param {*} receiver
			 * @returns {*|ObservedArray|{buildCallback: null, container: null, builtWith: string}|InternalUsageObject}
			 */
			get: (target, key, receiver) => { // eslint-disable-line no-unused-vars
				if (key===INTERNAL_USAGES_SYMBOL) {
					return internalUsages;
				}

				if (key===SELF_BUILD) {
					return selfBuild;
				}

				if (key===INTERNAL_ARRAY) {
					return this;
				}

				return target[key];
			},
			/**
			 * Set Handler for ObservedArray Proxy.
			 * @param {*} target
			 * @param {string|symbol} key
			 * @param {*} value
			 * @param {*} receiver
			 * @returns {undefined|*}
			 */
			set: (target, key, value, receiver) => {
				// can not set prototyped values.
				if (key===INTERNAL_USAGES_SYMBOL) {
					return (internalUsages = value);
				}

				if (key==="length") {
					return Reflect.set(target, key, value);
				}

				if (key in Object.getPrototypeOf(this) || key.startsWith("__")) {
					return undefined;
				}

				if (target[key] instanceof ObservedValue) {
					const event = ObservedArray._createChangeValueEvent(value, target[key], receiver, {key, type: 'set'});
					ObservedArray._dispatchStatic(internalUsages, event, true, );
					return target[key].setValue(value);
				}

				const event = ObservedArray._createChangeValueEvent(value, target[key], receiver, {key, type: 'set'});
                target[key] = value;
                ObservedArray._dispatchStatic(internalUsages, event, true);

                return true;
			}
		});
	}

	/**
	 * Make sure we returned Observed array from array.map and other similar functions that create "speciation".
	 * @returns {ObservedArray}
	 */
	get [Symbol.species]() {
		return ObservedArray;
	}

    triggerEmptyChange(){
        const event = ObservedArray._createChangeValueEvent(this.length, this.length, this);
        ObservedArray._dispatchStatic(this[INTERNAL_USAGES_SYMBOL], event);
    }

	/**
	 * @param {Array} arrayToReplaceWith
	 * @param {boolean} runEvent
	 */
	[Symbol.for("__ARRAY_REPLACE__")](arrayToReplaceWith=[], runEvent = false) {

            this[INTERNAL_ARRAY].splice(0, this[INTERNAL_ARRAY].length, ...arrayToReplaceWith);
            if (runEvent) {
                const event = ObservedArray._createChangeValueEvent(null, null, this);
                ObservedArray._dispatchStatic(this[INTERNAL_USAGES_SYMBOL], event);
            }
	}

	/**
	 * Array filter callback
	 * @callback filterCallback
	 * @param {*} item
	 * @param {number|string} [key]
	 * @returns {boolean} Whether or not to keep that item.
	 */

	/**
	 * Array filter functionality. If you want to chain it with a map, create a copy of it
	 * @example let myFilteredArray = new ObservedArray(...(originalArray.filter(item => item > 10)));
	 * @param {filterCallback} callback
	 * @returns {*}
	 */
	filter(callback) {
        const newlyBuiltArray = super.filter(callback);

        if (this.length===0) {
            newlyBuiltArray[INTERNAL_ARRAY].splice(0, 1);
        }

        // this event listener may in fact never be removed ... possible source of memory leaking.
        this.addEventListener("change", event => {

            if(event.detail.changeInfo?.type === 'set') {
                const newItem = event.detail.value;
                const isValid = callback(newItem);
                if(isValid) {
                    newlyBuiltArray[event.detail.changeInfo.key] = newItem;
                }
            } else if( event.detail.changeInfo?.type === 'delete') {
                const isExiting = newlyBuiltArray[INTERNAL_ARRAY].find(item=> item[INTERNAL_ARRAY][event.detail.changeInfo.identifier] === event.detail.changeInfo.id);
                if(isExiting) {
                    newlyBuiltArray.delete(event.detail.changeInfo.id, event.detail.changeInfo.identifier);
                }
            } else  {
                newlyBuiltArray[INTERNAL_ARRAY].splice(
                        0,
                        newlyBuiltArray.length,
                        ...Array.from(event.eventTarget).filter(callback)
                );
                ObservedArray._dispatchStatic(
                        newlyBuiltArray[INTERNAL_USAGES_SYMBOL],
                        ObservedArray._createChangeValueEvent(null, null, newlyBuiltArray)
                );
            }
        });

        return newlyBuiltArray;
	}

    pipe(targetArray) {
        this.addEventListener('change', (e) => {
            if (e.detail?.changeInfo?.type === 'set') {
                targetArray[+e.detail.changeInfo.key] = e.detail.value
            } else if (e.detail?.changeInfo?.type === 'delete') {
                targetArray.delete(e.detail?.changeInfo?.id, e.detail?.changeInfo?.identifier)
            } else {
                const replaceArray = e.eventTarget || e.detail.value;
                targetArray[Symbol.for("__ARRAY_REPLACE__")](replaceArray, true);
            }
        })
    }

	/**
	 * Array map callback
	 * @callback mapCallback
	 * @param {*} item
	 * @param {number|string} [key]
	 * @returns {*} Changed item
	 */

	/**
	 *
	 * @param {mapCallback} callback
	 * @param {boolean} returnsStrings = defaults to false. States whether the map returns strings. Otherwise it expects you to return document Fragments.
	 * @returns {Uint8Array | BigInt64Array | *[] | Float64Array | Int8Array | Float32Array | Int32Array | Uint32Array | Uint8ClampedArray | BigUint64Array | Int16Array | Uint16Array}
	 */
	map(callback, returnsStrings = false, isRenderFunction = true) {
		const newlyBuiltArray = super.map(callback);
		// Due to a bug in javascript we have to do this. Super map will create an array with the first element set to zero.
		if (this.length===0) {
			newlyBuiltArray[INTERNAL_ARRAY].splice(0, 1);
		}

		this.addEventListener("change", (event) => {
            newlyBuiltArray[INTERNAL_ARRAY].splice(
					0,
					newlyBuiltArray[INTERNAL_ARRAY].length,
					...Array.from(this[INTERNAL_ARRAY])
			);
            const changeEvent = ObservedArray._createChangeValueEvent(event.detail.value, event.detail.oldValue, newlyBuiltArray, event.detail.changeInfo)
            ObservedArray._dispatchStatic(
					newlyBuiltArray[INTERNAL_USAGES_SYMBOL],
                    changeEvent,
                    event.detail.changeInfo
			);
        });
		newlyBuiltArray[SELF_BUILD].builtWith = "map";
		newlyBuiltArray[SELF_BUILD].buildCallback = callback;
		newlyBuiltArray[SELF_BUILD].returnsStrings = returnsStrings;
        newlyBuiltArray[SELF_BUILD].isRenderFunction = isRenderFunction;
		return newlyBuiltArray;
	}

    cleanAfterRender(){
        if(this[SELF_BUILD].isRenderFunction) {
            this[INTERNAL_ARRAY].splice(0, this[INTERNAL_ARRAY].length);
        }
    }


    delete(id, identifier = 'id') {

        const internalUsage = this[INTERNAL_USAGES_SYMBOL];
        const index = this[INTERNAL_ARRAY].findIndex(item => item[identifier] === id);
        this[INTERNAL_ARRAY].splice(index, 1);
        const changeEvent = ObservedArray._createChangeValueEvent(null, null, this, {type: 'delete', id, identifier, key: index});
        ObservedArray._dispatchStatic(
                internalUsage,
                changeEvent,
                true
        );
    }


    /**
	 * TODO: Change this in case it interferes with the templates ?
	 * @param {string} hint
	 * @returns {string|number}
	 */
	[Symbol.toPrimitive](hint) {
		switch (hint) {
			case "string":
				return `${this.join("")}`;
			case "number":
				return NaN;
		}
	}
}
