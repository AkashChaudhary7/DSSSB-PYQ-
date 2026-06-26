import { syncQuestionsFromFirestore } from './src/lib/questionSync.js';

(global as any).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

(global as any).indexedDB = {
  open: () => {
    const req: any = {};
    setTimeout(() => {
      req.result = {
        objectStoreNames: { contains: () => true },
        transaction: () => ({
          objectStore: () => ({
            getAll: () => {
              const req2: any = {};
              setTimeout(() => { req2.result = []; if(req2.onsuccess) req2.onsuccess(); }, 0);
              return req2;
            },
            add: () => {
              const req3: any = {};
              setTimeout(() => { if(req3.onsuccess) req3.onsuccess(); }, 0);
              return req3;
            },
            put: () => {
              const req3: any = {};
              setTimeout(() => { if(req3.onsuccess) req3.onsuccess(); }, 0);
              return req3;
            }
          })
        })
      };
      if (req.onsuccess) req.onsuccess();
    }, 0);
    return req;
  }
};

async function test() {
  console.log("Starting syncQuestionsFromFirestore...");
  const result = await syncQuestionsFromFirestore(['dsssb_tgt_cs']);
  console.log("Result length:", result.length);
  process.exit(0);
}
test();
