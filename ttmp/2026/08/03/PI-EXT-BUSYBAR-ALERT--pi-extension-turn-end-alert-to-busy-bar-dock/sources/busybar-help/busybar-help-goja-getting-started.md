# busybar help busybar-goja-getting-started

```text

  # Getting Started with Busy Bar JavaScript:                                 
                                                                              
  Write, run, and extend a CommonJS JavaScript application for a BUSY Bar.    
                                                                              
  This tutorial builds a small BUSY Bar JavaScript application, runs it with  
  busybar script, and then adds live input handling. The host uses Goja and   
  CommonJS, so scripts use require(...) and an async IIFE rather than top-    
  level                                                                       
  await.                                                                      
                                                                              
  ## What you will build                                                      
                                                                              
  The finished script connects to a BUSY Bar, draws a message on the front    
  display, listens for normalized input events, and clears its application    
  when the user presses BACK. The same structure works for menus, dashboards, 
  and device-side demos.                                                      
                                                                              
  ## Prerequisites                                                            
                                                                              
  Build or run the repository's CLI from the project root. You need a         
  reachable BUSY Bar address and an API token if the device requires          
  authentication.                                                             
                                                                              
    go run ./cmd/busybar help                                                 
                                                                              
  The CLI defaults to 10.0.4.20. Pass a different address with --addr, and    
  pass                                                                        
  a token with --token. Those CLI values become the script globals            
  BUSYBAR_ADDR                                                                
  and BUSYBAR_TOKEN.                                                          
                                                                              
  ## Step 1 — Write a finite display script                                   
                                                                              
  Start with one draw operation and an explicit clear. A finite script is     
  useful for smoke tests because it exits after the Promise chain completes.  
                                                                              
  Create hello.js:                                                            
                                                                              
    const busybar = require("busybar");                                       
                                                                              
    const app = busybar                                                       
      .connect({                                                              
        address: globalThis.BUSYBAR_ADDR || "10.0.4.20",                      
        token: globalThis.BUSYBAR_TOKEN || "",                                
      })                                                                      
      .app("getting-started")                                                 
      .priority(100);                                                         
                                                                              
    (async () => {                                                            
      await app.draw({                                                        
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
      console.log("Displayed HELLO");                                         
    })().catch(error => {                                                     
      console.error("display failed", String(error));                         
      throw error;                                                            
    });                                                                       
                                                                              
  The application name is the ownership key used by the device. The priority  
  controls arbitration, while the element fields describe what pixels to draw.
  draw returns a Promise, so awaiting it makes failures visible before the    
  script exits.                                                               
                                                                              
  ## Step 2 — Run the script                                                  
                                                                              
  Run the file with the script command:                                       
                                                                              
    go run ./cmd/busybar script \                                             
      --input ./hello.js \                                                    
      --addr 192.168.0.136 \                                                  
      --token "$BUSYBAR_TOKEN" \                                              
      --format json                                                           
                                                                              
  The CLI reports a structured success row after the CommonJS file evaluates. 
  The display element remains device-side after a finite script exits. Clear  
  it                                                                          
  explicitly when the experiment is complete:                                 
                                                                              
    go run ./cmd/busybar clear \                                              
      --addr 192.168.0.136 \                                                  
      --token "$BUSYBAR_TOKEN" \                                              
      --application-name getting-started                                      
                                                                              
  For local builder and syntax checks that do not need a device, use the      
  repository example:                                                         
                                                                              
    busybar script \                                                          
      --input examples/busybar-js/00-builder-only.js \                        
      --format json                                                           
                                                                              
  ## Step 3 — Add a live input listener                                       
                                                                              
  An input listener starts the BUSY Bar WebSocket stream. Events arrive as    
  plain objects, so the script can branch on kind without decoding protobuf   
  messages.                                                                   
                                                                              
  Replace hello.js with this interactive version:                             
                                                                              
    const busybar = require("busybar");                                       
                                                                              
    const app = busybar                                                       
      .connect({                                                              
        address: globalThis.BUSYBAR_ADDR || "10.0.4.20",                      
        token: globalThis.BUSYBAR_TOKEN || "",                                
      })                                                                      
      .app("getting-started")                                                 
      .priority(100)                                                          
      .onInput((event, currentApp) => {                                       
        console.log("input", JSON.stringify(event));                          
        if (event.kind === "button" &&                                        
            event.button === "BACK" &&                                        
            event.action === "PRESS") {                                       
          void currentApp.clear();                                            
        }                                                                     
      })                                                                      
      .on("error", error => {                                                 
        console.error("input stream error", String(error));                   
      });                                                                     
                                                                              
    (async () => {                                                            
      await app.draw({                                                        
        elements: [{                                                          
          id: "interactive-hello",                                            
          type: "text",                                                       
          text: "TURN WHEEL",                                                 
          font: "small",                                                      
          color: "#00FF00FF",                                                 
          display: "front",                                                   
          align: "center",                                                    
          x: 36,                                                              
          y: 8,                                                               
        }],                                                                   
      });                                                                     
      console.log("Turn the encoder or press BACK");                          
    })().catch(error => {                                                     
      console.error("application failed", String(error));                     
      throw error;                                                            
    });                                                                       
                                                                              
  Run it with --keep-alive:                                                   
                                                                              
    go run ./cmd/busybar script \                                             
      --input ./hello.js \                                                    
      --addr 192.168.0.136 \                                                  
      --token "$BUSYBAR_TOKEN" \                                              
      --keep-alive                                                            
                                                                              
  The host remains alive until Ctrl-C or termination. The runtime periodically
  pumps the Goja owner so WebSocket callbacks can execute. Without --keep-    
  alive,                                                                      
  the host exits after the initial script evaluation even if a listener has   
  started a stream.                                                           
                                                                              
  ## Step 4 — Draw an opaque interactive screen                               
                                                                              
  Display elements are composited by application and priority. Clearing your  
  application removes only its elements; it does not deactivate the clock or  
  another application underneath. If a menu should hide lower-priority content,
  draw a full-screen opaque rectangle before its text and images.             
                                                                              
    await app.draw({                                                          
      elements: [{                                                            
        id: "background",                                                     
        type: "rectangle",                                                    
        display: "front",                                                     
        x: 0,                                                                 
        y: 0,                                                                 
        width: 72,                                                            
        height: 16,                                                           
        fill: "solid",                                                        
        fill_colors: ["#000000FF"],                                           
        border_width: 0,                                                      
      }, {                                                                    
        id: "menu-title",                                                     
        type: "text",                                                         
        text: "MENU",                                                         
        font: "small",                                                        
        color: "#00FF00FF",                                                   
        display: "front",                                                     
        align: "center",                                                      
        x: 36,                                                                
        y: 8,                                                                 
      }],                                                                     
    });                                                                       
                                                                              
  Serialize complete screen transitions. For example, await clear() before    
  draw() when returning from a result screen. If multiple input callbacks can 
  start renders, put them on one Promise chain; otherwise an older draw can   
  arrive after a newer BACK transition.                                       
                                                                              
  ## Step 5 — Play a compiled animation                                       
                                                                              
  Use the fluent playback builder when the animation is a local compiled .anim
  file. start() uploads the asset under the application name and then draws   
  it.                                                                         
                                                                              
    const animation = app                                                     
      .animation("examples/busybar-js/assets/spinner-front.anim")             
      .front()                                                                
      .loop();                                                                
                                                                              
    await animation.start();                                                  
                                                                              
  The front display is 72×16 and the back display is 160×80. Inspect or       
  compile an asset with the CLI before using it:                              
                                                                              
    busybar inspect \                                                         
      --input examples/busybar-js/assets/spinner-front.anim \                 
      --format json                                                           
                                                                              
  ## Complete example                                                         
                                                                              
  The repository's menu combines drawing, animation, encoder selection, button
  activation, clear operations, and a serialized render queue. Run it from the
  repository root:                                                            
                                                                              
    busybar script \                                                          
      --input examples/busybar-js/11-menu.js \                                
      --addr 192.168.0.136 \                                                  
      --token "$BUSYBAR_TOKEN" \                                              
      --keep-alive                                                            
                                                                              
  Turn the encoder to change the selection, press OK to activate it, and press
  BACK to return to the menu. Inspect examples/busybar-js/09-js-capability-   
  smoke.js for a sequential display tour and examples/busybar-js/10-stream-   
  print.js for a raw input observer.                                          
                                                                              
  ## Troubleshooting                                                          
                                                                              
   Problem                | Cause                  | Solution                 
  ------------------------|------------------------|------------------------  
   Cannot find module     | The script was run     | Run from the             
                          | from the wrong         | repository root and      
                          | location or a relative | use                      
                          | module path is         | require("busybar"),      
                          | unavailable.           | require("timer"), or a   
                          |                        | path relative to the     
                          |                        | script.                  
   options object is      | connect received no    | Pass `{ address:         
   required               | options object.        | globalThis.BUSYBAR_ADD   
                          |                        | R                        
   Script exits while     | The host finished      | Add --keep-alive.        
   waiting for input      | script evaluation.     |                          
   No input events appear | The device is idle or  | Move the encoder or      
                          | the stream cannot      | press a button; check    
                          | connect.               | --addr and --token.      
   HTTP 403               | The device requires    | Pass --token             
                          | authentication.        | "$BUSYBAR_TOKEN".        
   HTTP 409               | The application        | Set an intentional       
                          | priority is too low.   | priority between 1 and   
                          |                        | 100.                     
   Clock pixels show      | The menu paints only   | Draw an opaque 72×16     
   around the menu        | its text or image      | rectangle behind the     
                          | bounds.                | content.                 
   Previous screen        | clear and draw         | Await the complete       
   remains after BACK     | operations were        | transition and           
                          | started concurrently.  | serialize competing      
                          |                        | renders.                 
   close() leaves the     | Closing cancels input  | Call await app.clear()   
   screen visible         | but does not clear     | when shutting down.      
                          | display elements.      |                          
   Animation is not       | The asset dimensions   | Run busybar inspect      
   visible                | do not match the       | and choose .front() or   
                          | selected display.      | .back() accordingly.     
                                                                              
  ## See Also                                                                 
                                                                              
  • Busy Bar JavaScript API Reference /busybar-goja.md — complete module and  
  method reference.                                                           
  • Busy Bar CLI User Guide /animation-cli.md — CLI workflow, structured      
  output, smoke tests, and stream inspection.                                 
  • JavaScript lesson index /examples/busybar-js/README.md — progressive      
  lesson index and reusable helper module.                                    
  • Interactive menu example /examples/busybar-js/11-menu.js — opaque         
  backgrounds and serialized render transitions.                              

```
