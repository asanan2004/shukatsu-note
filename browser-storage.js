"use strict";
// Standalone storage adapter. Never reads the extension's storage or tabs.
(() => {
  const prefix = "shukatsu-browser-v1:";
  const listeners = [];
  const area = (backend, name) => ({
    async get(keys) {
      const raw = backend.getItem(prefix + name);
      const data = raw === null ? {} : JSON.parse(raw);
      if (keys === null || keys === undefined) return data;
      if (typeof keys === "string") keys = [keys];
      if (Array.isArray(keys)) return Object.fromEntries(keys.filter(k => Object.hasOwn(data,k)).map(k => [k,data[k]]));
      return Object.assign({},keys,data);
    },
    async set(values) {
      const old = await this.get(null), data = {...old,...values};
      backend.setItem(prefix + name,JSON.stringify(data));
      const changes = Object.fromEntries(Object.keys(values).map(k => [k,{oldValue:old[k],newValue:values[k]}]));
      listeners.forEach(fn => fn(changes,name));
    },
    async remove(keys) {
      const data = await this.get(null); for (const key of Array.isArray(keys)?keys:[keys]) delete data[key];
      backend.setItem(prefix + name,JSON.stringify(data));
    }
  });
  // A local compatibility object, without extension-only capabilities.
  window.chrome = { storage:{local:area(localStorage,"local"),session:area(sessionStorage,"session"),onChanged:{addListener:fn=>listeners.push(fn)}} };
})();
