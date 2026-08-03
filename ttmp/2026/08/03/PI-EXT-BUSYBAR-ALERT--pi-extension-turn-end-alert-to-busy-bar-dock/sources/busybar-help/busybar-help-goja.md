# busybar help busybar-goja

```text

  # Busy Bar JavaScript API Reference:                                        
                                                                              
  Reference for the fluent require("busybar") API, display payloads, playback 
  builders, and input events.                                                 
                                                                              
  The busybar native module gives a Goja-hosted CommonJS script a Promise-    
  based                                                                       
  BUSY Bar client. It hides HTTP requests, WebSocket frames, and protobuf     
  decoding while preserving the device's application ownership and priority   
  rules.                                                                      
                                                                              
  ## Import and connect                                                       
                                                                              
  require("busybar") returns a module with one entry point, connect(options). 
  Connecting validates the options and creates builders; the first network    
  request happens when a terminal method such as draw, start, clear, or       
  version is awaited.                                                         
                                                                              
    const busybar = require("busybar");                                       
                                                                              
    const connection = busybar.connect({                                      
      address: globalThis.BUSYBAR_ADDR || "10.0.4.20",                        
      token: globalThis.BUSYBAR_TOKEN || "",                                  
      requestTimeoutMs: 5000,                                                 
      uploadTimeoutMs: 15000,                                                 
    });                                                                       
                                                                              
    const app = connection.app("intern-demo").priority(100);                  
                                                                              
  address is required. token is optional and becomes the device's X-API-Token 
  header. requestTimeoutMs and uploadTimeoutMs are non-negative millisecond   
  values; zero uses the client's default behavior.                            
                                                                              
  ## Application builder                                                      
                                                                              
  connection.app(applicationName) scopes display elements, uploaded assets,   
  input listeners, and clearing to one device-side application name. The      
  builder defaults to priority 50; priority(value) accepts integers from 1    
  through 100 and returns the same builder for chaining.                      
                                                                              
   Method               | Returns                | Behavior                   
  ----------------------|------------------------|--------------------------  
   priority(value)      | BusyBarAppBuilder      | Set display arbitration    
                        |                        | priority from 1 to 100.    
   draw(payload)        | Promise<void>          | Draw one or more wire-     
                        |                        | shaped display elements.   
   animation(localPath) | BusyBarPlaybackBuilder | Prepare an upload-and-     
                        |                        | draw animation             
                        |                        | operation.                 
   clear()              | Promise<void>          | Remove elements owned by   
                        |                        | this application name.     
   version()            | Promise<Record<string, | Read the device version    
                        | unknown>>              | response.                  
   close()              | Promise<void>          | Cancel the input stream    
                        |                        | and emit close; it does    
                        |                        | not clear the display.     
   on(event, listener)  | BusyBarAppBuilder      | Listen for input, error,   
                        |                        | or close.                  
   onInput(listener)    | BusyBarAppBuilder      | Add an input listener      
                        |                        | and start the WebSocket    
                        |                        | stream.                    
   off(event, listener) | BusyBarAppBuilder      | Remove a previously        
                        |                        | registered listener.       
                                                                              
  onInput(listener) receives (event, app), where app is the application       
  builder. Use void for asynchronous work started by a callback and attach an 
  error listener so stream failures are visible.                              
                                                                              
  ## Draw display elements                                                    
                                                                              
  app.draw(payload) accepts the firmware's JSON-shaped display payload. The   
  native module adds the application name and priority from the builder, so   
  the payload must contain elements but does not need those transport fields. 
                                                                              
    await app.draw({                                                          
      led_notification_color: "#00FF00FF",                                    
      elements: [{                                                            
        id: "hello",                                                          
        type: "text",                                                         
        text: "HELLO",                                                        
        font: "normal",                                                       
        color: "#00FF00FF",                                                   
        display: "front",                                                     
        align: "center",                                                      
        x: 36,                                                                
        y: 8,                                                                 
      }],                                                                     
    });                                                                       
                                                                              
  Every element requires a non-empty id and type. Supported types are text,   
  image, animation, countdown, and rectangle. Field names intentionally match 
  the firmware wire contract.                                                 
                                                                              
   Type      | Important fields             | Notes                           
  -----------|------------------------------|-------------------------------  
   text      | text, font, color, display,  | Use timeout when firmware       
             | align, x, y                  | should remove the element       
             |                              | automatically.                  
   image     | stock_path or path, display, | Stock paths such as             
             | align, x, y                  | shared/checkmark_front_8x8.im   
             |                              | age are device assets.          
   animation | path, display, section,      | Prefer                          
             | loop, await_previous_end,    | app.animation(localPath) for    
             | opacity                      | local .anim uploads.            
   countdown | timestamp, direction,        | timestamp is sent as a          
             | show_hours, color, display,  | string.                         
             | align, x, y                  |                                 
   rectangle | x, y, width, height, fill,   | Draw an opaque full-screen      
             | fill_colors, border_width,   | rectangle when lower layers     
             | border_color                 | must not show through.          
                                                                              
  Common optional fields include display (front or back), align, x, y,        
  opacity, and timeout. Front is 72×16 RGB888; back is 160×80 gray4. The API  
  accepts the JSON field names stock_path, fill_colors, show_hours, and       
  await_previous_end exactly as the firmware expects them.                    
                                                                              
  ## Animation playback builder                                               
                                                                              
  app.animation(localPath) creates a builder for a local compiled .anim file. 
  start() reads the file, uploads it under the application name, and then     
  draws it; upload and draw are sequential rather than atomic.                
                                                                              
    await app                                                                 
      .animation("./assets/rainbow30.anim")                                   
      .front()                                                                
      .loop()                                                                 
      .position(0, 0)                                                         
      .opacity(100)                                                           
      .awaitPreviousEnd(false)                                                
      .start();                                                               
                                                                              
   Method                    | Returns          | Default or validation       
  ---------------------------|------------------|---------------------------  
   `display("front"          | "back")`         | Playback builder            
   front() / back()          | Playback builder | Shortcuts for display.      
   loop(enabled = true)      | Playback builder | Loop the animation when     
                             |                  | enabled.                    
   section(name)             | Playback builder | Select an animation         
                             |                  | section; default is         
                             |                  | default.                    
   position(x, y)            | Playback builder | Set the element position.   
   opacity(value)            | Playback builder | Integer from 0 through      
                             |                  | 100; default is 100.        
   awaitPreviousEnd(enabled  | Playback builder | Wait for a previous         
   = true)                   |                  | animation end when          
                             |                  | enabled.                    
   start()                   | Promise<void>    | Upload and draw the         
                             |                  | .anim.                      
                                                                              
  Playback builders also support on, onInput, and the app's input stream. The 
  playback builder shares the parent application's priority and lifecycle.    
                                                                              
  ## Input events                                                             
                                                                              
  The first onInput or on("input", listener) call starts a WebSocket reader   
  for /api/status/ws. The reader enables the firmware stream, decodes input   
  updates, and posts callbacks onto the Goja runtime owner thread; network    
  goroutines never call JavaScript directly.                                  
                                                                              
    app.onInput((event, currentApp) => {                                      
      if (event.kind === "encoder") {                                         
        console.log("delta", event.delta);                                    
      } else if (event.kind === "button" && event.action === "PRESS") {       
        if (event.button === "BACK") void currentApp.clear();                 
      }                                                                       
    });                                                                       
                                                                              
   Event                   | Shape                                            
  -------------------------|------------------------------------------------  
   Button                  | `{ kind: "button", timestamp, button: "OK"       
   Switch                  | `{ kind: "switch", timestamp, position: "BUSY"   
   Encoder                 | { kind: "encoder", timestamp, delta }            
                                                                              
  timestamp is the device timestamp in milliseconds. Encoder delta may be     
  positive or negative. The normalized objects are plain JavaScript values, so
  applications can log or persist them without protobuf helpers.              
                                                                              
  ## Promises, errors, and lifecycle                                          
                                                                              
  All device operations return Promises because the Goja runtime must remain  
  responsive while HTTP, upload, and WebSocket work happens off the owner     
  thread. Await terminal methods inside an async IIFE or handle rejection     
  explicitly.                                                                 
                                                                              
    (async () => {                                                            
      try {                                                                   
        await app.draw({ elements: [{                                         
          id: "status", type: "text", text: "READY",                          
          font: "small", color: "#00FF00FF", display: "front",                
          align: "center", x: 36, y: 8,                                       
        }] });                                                                
      } finally {                                                             
        await app.clear();                                                    
        await app.close();                                                    
      }                                                                       
    })().catch(error => console.error("BUSY Bar failed", String(error)));     
                                                                              
  clear() removes only this application's display elements; it does not       
  deactivate the clock or another application. close() cancels this           
  application's input stream but does not clear already drawn elements. For an
  interactive screen, serialize transitions such as clear → draw so an older  
  asynchronous draw cannot arrive after a newer screen. A full-screen opaque  
  background prevents lower-priority pixels from showing through around text  
  or                                                                          
  images.                                                                     
                                                                              
  If the application is closed, later operations reject with an application-  
  closed error. Device HTTP failures, upload failures, invalid payloads, and  
  cancelled contexts reject their corresponding Promise. Attach on("error",   
  listener) to observe input-stream failures.                                 
                                                                              
  ## TypeScript shape                                                         
                                                                              
  The module exposes declarations for xgoja generation. The principal types   
  are BusyBarConnectOptions, BusyBarInputEvent, BusyBarDrawElement,           
  BusyBarDrawPayload, BusyBarAppBuilder, and BusyBarPlaybackBuilder.          
                                                                              
    interface BusyBarConnectOptions {                                         
      address: string;                                                        
      token?: string;                                                         
      requestTimeoutMs?: number;                                              
      uploadTimeoutMs?: number;                                               
    }                                                                         
                                                                              
    type BusyBarInputEvent =                                                  
      | { kind: "button"; timestamp: number; button: "OK" | "BACK" | "START"; 
  action: "PRESS" | "RELEASE" }                                               
      | { kind: "switch"; timestamp: number; position: "BUSY" | "CUSTOM" |    
  "OFF" | "APPS" | "SETTINGS" }                                               
      | { kind: "encoder"; timestamp: number; delta: number };                
                                                                              
  Generate declarations for the xgoja example with xgoja gen-dts -f           
  examples/xgoja/busybar-demo/xgoja.yaml --out /tmp/busybar-demo.d.ts.        
                                                                              
  ## Troubleshooting                                                          
                                                                              
   Problem                | Cause                  | Solution                 
  ------------------------|------------------------|------------------------  
   options object is      | connect received no    | Pass { address: "..."    
   required               | object.                | }.                       
   address is required    | The connection address | Set address or pass      
                          | is empty.              | the CLI's BUSYBAR_ADDR   
                          |                        | value.                   
   draw payload requires  | The payload has no     | Supply at least one      
   at least one element   | elements.              | element with an id and   
                          |                        | type.                    
   Promise rejects with   | The device requires a  | Pass token or use the    
   HTTP 403               | token.                 | CLI --token value.       
   Promise rejects with   | Another application    | Choose an appropriate    
   HTTP 409               | has higher draw        | priority from 1 to       
                          | priority.              | 100.                     
   Input callbacks never  | The host exited or no  | Run with --keep-alive    
   arrive                 | listener started the   | and call onInput or      
                          | stream.                | on("input", ...).        
   Old content appears    | Clear/draw operations  | Queue complete screen    
   after BACK             | were launched          | transitions and await    
                          | concurrently.          | each clear and draw.     
   Clock shows through a  | The app paints only    | Draw an opaque full-     
   menu                   | some pixels.           | display rectangle        
                          |                        | behind the menu.         
   close() leaves pixels  | Close cancels input    | Call await app.clear()   
   visible                | but is not a display   | before or during         
                          | clear.                 | shutdown.                
                                                                              
  ## See Also                                                                 
                                                                              
  • Getting Started with Busy Bar JavaScript /busybar-goja-getting-started.md 
  — step-by-step guide for writing and running CommonJS scripts.              
  • Busy Bar CLI User Guide /animation-cli.md — CLI commands for assets,      
  display, input streaming, and script hosting.                               
  • JavaScript lesson index /examples/busybar-js/README.md — progressive      
  examples from builders to an interactive menu.                              
  • xgoja provider configuration /examples/xgoja/busybar-demo/xgoja.yaml —    
  generated-host provider setup.                                              

```
