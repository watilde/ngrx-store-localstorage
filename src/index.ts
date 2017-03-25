const INIT_ACTION = '@ngrx/store/init';
const detectDate = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/;

// correctly parse dates from local storage
export const dateReviver = (key: string, value: any) => {
    if (typeof value === 'string' && (detectDate.test(value))) {
        return new Date(value);
    }
    return value;
};

const validateStateKeys = (keys: any[]) => {
    return keys.map(key => {
        let attr = key;

        if (typeof key === 'object') {
          attr = Object.keys(key)[0];
        }

        if (typeof (attr) !== 'string') {
            throw new TypeError(
                `localStorageSync Unknown Parameter Type: `
                + `Expected type of string, got ${typeof attr}`
            );
        }
        return key;
    });
};

export const rehydrateApplicationState = (keys: any[], storage: Storage) => {
    return keys.reduce((acc, curr) => {
        let key = curr;
        let reviver = dateReviver;
        let deserialize = undefined;
        let decrypt = undefined;

        if (typeof key === 'object') {
          key = Object.keys(key)[0];
          // use the custom reviver function
          if (typeof curr[key] === 'function') {
              reviver = curr[key];
          }
          else {
              // use custom reviver function if available
              if (curr[key].reviver) {
                reviver = curr[key].reviver;
              }
              // use custom serialize function if available
              if (curr[key].deserialize) {
                deserialize = curr[key].deserialize;
              }
          }

          // Ensure that encrypt and decrypt functions are both presents
          if (curr[key].encrypt && curr[key].decrypt) {
              if (typeof (curr[key].encrypt) === 'function' && typeof (curr[key].decrypt) === 'function') {
                  decrypt = curr[key].decrypt;
              } else {
                  console.error(`Either encrypt or decrypt is not a function on '${curr[key]}' key object.`);
              }
          } else if (curr[key].encrypt || curr[key].decrypt) {
              // Let know that one of the encryption functions is not provided
              console.error(`Either encrypt or decrypt function is not present on '${curr[key]}' key object.`);
          }
        }

        let stateSlice = storage.getItem(key);
        if (stateSlice) {
            // Use provided decrypt function
            if (decrypt) {
                stateSlice = decrypt(stateSlice);
            }
            let raw = JSON.parse(stateSlice, reviver);
            return Object.assign({}, acc, { [key]: deserialize ? deserialize(raw) : raw });
        }
        return acc;
    }, {});
};

export const syncStateUpdate = (state: any, keys: any[], storage: Storage, removeOnUndefined: boolean) => {
    keys.forEach(key => {

        let stateSlice = state[key];
        let replacer = undefined;
        let space = undefined;
        let encrypt = undefined;

        if (typeof key === 'object') {
            let name = Object.keys(key)[0];
            stateSlice = state[name];

            if (key[name]) {
                // use serialize function if specified.
                if (key[name].serialize) {
                    stateSlice = key[name].serialize(stateSlice);
                }
                // if serialize function is not specified filter on fields if an array has been provided.
                else {
                    let filter = undefined;
                    if (key[name].reduce) {
                        filter = key[name];
                    }
                    else if (key[name].filter) {
                        filter = key[name].filter;
                    }
                    if (filter) {
                        stateSlice = filter.reduce((memo, attr) => {
                            memo[attr] = stateSlice[attr];
                            return memo;
                        }, {});
                    }

                    // Only check for encrypt function, both were checked at this#rehydrateApplicationState()
                    if (key[name].encrypt) {
                        if (typeof (key[name].encrypt) === 'function') {
                            encrypt = key[name].encrypt;
                        }
                    }
                }

                /*
                    Replacer and space arguments to pass to JSON.stringify.
                    If these fields don't exist, undefined will be passed.
                */
                replacer = key[name].replacer;
                space = key[name].space;
            }

            key = name;
        }

        if (typeof(stateSlice) !== 'undefined') {
            try {
                if (encrypt) {
                    stateSlice = encrypt(stateSlice);
                }
                storage.setItem(key, typeof stateSlice === 'string' ? stateSlice : JSON.stringify(stateSlice, replacer, space));
            } catch (e) {
                console.warn('Unable to save state to localStorage:', e);
            }
        } else if (typeof(stateSlice) === 'undefined' && removeOnUndefined) {
            try {
                storage.removeItem(key);
            } catch (e) {
                console.warn(`Exception on removing/cleaning undefined '${key}' state`, e);
            }
    }
    });
};

export const localStorageSync = (keys: any[], rehydrate: boolean = false, storage: Storage = localStorage, removeOnUndefined: boolean = false) => (reducer: any) => {
    const stateKeys = validateStateKeys(keys);
    const rehydratedState = rehydrate ? rehydrateApplicationState(stateKeys, storage) : undefined;

    return function (state = rehydratedState, action: any) {
        /*
         Handle case where state is rehydrated AND initial state is supplied.
         Any additional state supplied will override rehydrated state for the given key.
         */
        if (action.type === INIT_ACTION && rehydratedState) {
            state = Object.assign({}, state, rehydratedState);
        }
        const nextState = reducer(state, action);
        syncStateUpdate(nextState, stateKeys, storage, removeOnUndefined);
        return nextState;
    };
};

/*
    Wraps localStorageSync functionality acepting the removeOnUndefined boolean parameter in order
    to clean/remove the state from the browser on situations like state reset or logout.
    Defines localStorage as default storage.
*/
export const localStorageSyncAndClean = (keys: any[], rehydrate: boolean = false, removeOnUndefined: boolean = false) => (reducer: any) => {
    return this.localStorageSync(keys, rehydrate, localStorage, removeOnUndefined);
};
