"use strict";const e=require("electron");e.contextBridge.exposeInMainWorld("api",{ping:()=>e.ipcRenderer.invoke("ping")});
