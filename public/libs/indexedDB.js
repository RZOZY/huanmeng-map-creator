let db;
let opening;

const DATABASE_NAME = "d2";
const STORE_NAME = "s";

const openDatabase = () => {
  if (db) return Promise.resolve(db);
  if (opening) return opening;

  opening = new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("IndexedDB is not supported"));
    const request = window.indexedDB.open(DATABASE_NAME);
    let failed = false;
    const fail = error => {
      failed = true;
      reject(error);
    };

    request.onsuccess = () => {
      const database = request.result;
      if (failed) return database.close();
      db = database;
      const clearConnection = () => {
        if (db === database) db = undefined;
      };
      database.onversionchange = () => {
        clearConnection();
        database.close();
      };
      database.onclose = clearConnection;
      resolve(database);
    };

    request.onerror = () => fail(request.error || new Error("IndexedDB: database open failed"));
    request.onblocked = () => fail(new Error("IndexedDB: database open blocked"));

    request.onupgradeneeded = () => {
      const transaction = request.transaction;
      try {
        transaction.onerror = event =>
          fail(transaction.error || event.target?.error || new Error("IndexedDB: upgrade failed"));
        transaction.onabort = () => fail(transaction.error || new Error("IndexedDB: upgrade aborted"));
        request.result.createObjectStore(STORE_NAME, {keyPath: "key"});
      } catch (error) {
        fail(error);
        try {
          transaction.abort();
        } catch {}
      }
    };
  }).finally(() => {
    opening = undefined;
  });
  return opening;
};

const runTransaction = (mode, createRequest, readResult) => {
  return openDatabase().then(database => {
    return new Promise((resolve, reject) => {
      let result;
      try {
        const transaction = database.transaction(STORE_NAME, mode);
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = event =>
          reject(transaction.error || event.target?.error || new Error("IndexedDB: transaction failed"));
        transaction.onabort = () => reject(transaction.error || new Error("IndexedDB: transaction aborted"));
        const request = createRequest(transaction.objectStore(STORE_NAME));
        request.onerror = () => reject(request.error || transaction.error || new Error("IndexedDB: request failed"));
        request.onsuccess = () => {
          try {
            result = readResult(request.result);
          } catch (error) {
            reject(error);
          }
        };
      } catch (error) {
        if (error?.name === "InvalidStateError" && db === database) db = undefined;
        reject(error);
      }
    });
  });
};

const ldb = {
  get: key => runTransaction("readonly", store => store.get(key), result => result?.value ?? null),
  set: (keyName, value) => runTransaction("readwrite", store => store.put({key: keyName, value}), () => undefined)
};
