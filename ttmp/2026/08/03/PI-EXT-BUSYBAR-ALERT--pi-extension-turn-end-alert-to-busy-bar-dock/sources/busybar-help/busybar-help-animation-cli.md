# busybar help busybar-animation-cli

```text

  # Busy Bar CLI User Guide:                                                  
                                                                              
  Author animations, control a BUSY Bar, inspect input, and run JavaScript    
  applications from the CLI.                                                  
                                                                              
  busybar separates local animation authoring from device control. Use the    
  same CLI to create and compile .anim assets, upload them to a BUSY Bar,     
  inspect physical input, and host CommonJS JavaScript applications.          
                                                                              
  ## Prerequisites                                                            
                                                                              
  The device exposes an HTTP API and a WebSocket input stream. Give the CLI   
  the BUSY Bar's network address with --addr; the default is 10.0.4.20. If the
  device protects its API, pass --token, preferably from an environment       
  variable.                                                                   
                                                                              
    export BUSYBAR_ADDR=192.168.0.136                                         
    export BUSYBAR_TOKEN="..."                                                
                                                                              
  The CLI does not automatically read these variables for every command, so   
  use them explicitly when invoking commands:                                 
                                                                              
    busybar show \                                                            
      --input spinner_front_72x16.anim \                                      
      --addr "$BUSYBAR_ADDR" \                                                
      --token "$BUSYBAR_TOKEN" \                                              
      --application-name demo                                                 
                                                                              
  Run busybar --help for Cobra command help and busybar help to list the      
  embedded Glazed guides.                                                     
                                                                              
  ## Create and compile an animation                                          
                                                                              
  create turns either a built-in pattern or numbered PNG frames into a        
  portable                                                                    
  source zip. Add --compile-output when you also want a firmware-ready .anim  
  file                                                                        
  in the same operation.                                                      
                                                                              
    busybar create \                                                          
      --pattern spinner \                                                     
      --display front \                                                       
      --frames 12 \                                                           
      --fps 12 \                                                              
      --output spinner_front_72x16.zip \                                      
      --compile-output spinner_front_72x16.anim                               
                                                                              
  Use compile when the source zip already exists:                             
                                                                              
    busybar compile \                                                         
      --input spinner_front_72x16.zip \                                       
      --output spinner_front_72x16.anim                                       
                                                                              
  For custom frames, use natural zero-based numbering with no gaps:           
                                                                              
    frames/                                                                   
    ├── frame_0.png                                                           
    ├── frame_1.png                                                           
    └── frame_2.png                                                           
                                                                              
    busybar create \                                                          
      --frames-dir ./frames \                                                 
      --display back \                                                        
      --fps 8 \                                                               
      --output custom_back_160x80.zip \                                       
      --compile-output custom_back_160x80.anim                                
                                                                              
  The front display is 72×16 RGB888 and the back display is 160×80 gray4. All 
  frames in one animation must have identical dimensions. Gray4 packs two     
  pixels per byte, so the back-display pixel count must be even.              
                                                                              
  ## Inspect files before using hardware                                      
                                                                              
  inspect validates and summarizes either a source zip or compiled .anim. It  
  is useful in a terminal and in automation because it emits structured       
  output.                                                                     
                                                                              
    busybar inspect --input spinner_front_72x16.anim                          
    busybar inspect --input spinner_front_72x16.anim --format json            
                                                                              
  Inspect the dimensions, frame count, FPS, color mode, and byte size before  
  uploading. A front animation cannot be sent to the 160×80 back display, and 
  vice versa.                                                                 
                                                                              
  ## Upload and display an animation                                          
                                                                              
  show uploads the compiled .anim as an asset owned by --application-name,    
  then                                                                        
  sends an animation draw request. Upload and draw are sequential, not atomic;
  an upload can succeed even when a later draw is rejected.                   
                                                                              
    busybar show \                                                            
      --input spinner_front_72x16.anim \                                      
      --addr "$BUSYBAR_ADDR" \                                                
      --token "$BUSYBAR_TOKEN" \                                              
      --application-name intern-demo \                                        
      --display front \                                                       
      --priority 100 \                                                        
      --loop                                                                  
                                                                              
  The --priority value controls display arbitration from 1 to 100. Use a high 
  value only when the application should take over the display; a 409 response
  means another active application has higher priority.                       
                                                                              
  clear removes display elements owned by one application name. It does not   
  globally disable the clock or other applications. Clearing can therefore    
  reveal lower-priority content underneath. If an application should hide that
  content while it is active, draw an opaque full-display background.         
                                                                              
    busybar clear \                                                           
      --addr "$BUSYBAR_ADDR" \                                                
      --token "$BUSYBAR_TOKEN" \                                              
      --application-name intern-demo                                          
                                                                              
  ## Run the capability smoke test                                            
                                                                              
  smoke is a visible hardware tour, not a unit test. It clears one            
  application, displays text, an image, a rectangle, a countdown, and a       
  compiled animation, then clears the application again.                      
                                                                              
    busybar smoke \                                                           
      --addr "$BUSYBAR_ADDR" \                                                
      --token "$BUSYBAR_TOKEN" \                                              
      --application-name pi-capability-smoke \                                
      --animation examples/busybar-js/assets/rainbow30.anim \                 
      --priority 100 \                                                        
      --step-seconds 3                                                        
                                                                              
  Use --format json for one structured result after the tour. Increase --step-
  seconds when validating the display by eye. The bundled rainbow asset is    
  front-display sized.                                                        
                                                                              
  ## Inspect physical input with stream                                       
                                                                              
  stream connects to /api/status/ws, enables the binary protobuf status       
  stream, and prints one JSONL row for every button, switch, or encoder event.
  Idle devices may emit no input rows; turn the encoder or press a button     
  while the command is running.                                               
                                                                              
    busybar stream \                                                          
      --addr "$BUSYBAR_ADDR" \                                                
      --token "$BUSYBAR_TOKEN" \                                              
      --duration-seconds 30 \                                                 
      --format jsonl                                                          
                                                                              
  Each event contains a device timestamp, host receive time, and latency_ms.  
  The latency value is a clock-offset-inclusive estimate: it is host receive  
  time minus the device timestamp, not a pure network round-trip measurement. 
  A                                                                           
  final stream_end row reports the number of events observed. With --duration-
  seconds 0, stop the stream with Ctrl-C.                                     
                                                                              
  ## Run JavaScript applications                                              
                                                                              
  script hosts a CommonJS JavaScript file with require("busybar") and         
  require("timer") available. Use --keep-alive for input-driven applications; 
  without it, the command exits once the file finishes evaluating.            
                                                                              
    busybar script \                                                          
      --input examples/busybar-js/11-menu.js \                                
      --addr "$BUSYBAR_ADDR" \                                                
      --token "$BUSYBAR_TOKEN" \                                              
      --keep-alive                                                            
                                                                              
  The CLI exposes --addr and --token to the script as BUSYBAR_ADDR and        
  BUSYBAR_TOKEN. The script itself still supplies those values to             
  busybar.connect. See the JavaScript getting-started tutorial for a minimal  
  script and the API reference for method details.                            
                                                                              
  ## Use structured output                                                    
                                                                              
  Glazed commands emit structured rows. Use --format json for one result or --
  format jsonl when piping a sequence of rows:                                
                                                                              
    busybar create \                                                          
      --pattern spinner \                                                     
      --format jsonl \                                                        
      --output /tmp/demo.zip \                                                
      --compile-output /tmp/demo.anim                                         
                                                                              
    busybar inspect \                                                         
      --input /tmp/demo.anim \                                                
      --format json \                                                         
      --output-fields width,height,fps,color_mode,bytes                       
                                                                              
  The common output controls are --format, --output-fields, and --max-output- 
  rows.                                                                       
  Domain flags such as --fps, --display, and --addr change the operation      
  rather than                                                                 
  the output projection.                                                      
                                                                              
  ## Troubleshooting                                                          
                                                                              
   Problem                | Cause                  | Solution                 
  ------------------------|------------------------|------------------------  
   show requires a        | A source zip was       | Run compile first or     
   compiled .anim         | passed to playback.    | use create --compile-    
                          |                        | output.                  
   HTTP 403               | The device requires an | Pass --token             
                          | access key.            | "$BUSYBAR_TOKEN".        
   HTTP 409               | The draw priority is   | Choose an appropriate    
                          | below the active       | --priority and avoid     
                          | application.           | taking over another      
                          |                        | app casually.            
   Animation uploads but  | Dimensions, display,   | Run inspect, select      
   is not visible         | path, or section do    | the matching front or    
                          | not match.             | back display, and use    
                          |                        | --section default.       
   missing frame_N.png    | The frame directory    | Rename files to          
                          | has a gap or non-      | frame_0.png,             
                          | natural numbering.     | frame_1.png, and so      
                          |                        | on.                      
   gray4 requires an even | A back-display frame   | Use an even-sized        
   pixel count            | has an odd number of   | back-display frame.      
                          | pixels.                |                          
   stream prints no       | The device is idle or  | Move the encoder or      
   events                 | the WebSocket was not  | press a button; check    
                          | enabled.               | the address and token.   
   Interactive script     | The script host is not | Add --keep-alive and     
   exits immediately      | kept alive.            | handle Ctrl-C in the     
                          |                        | host.                    
   Clock content appears  | Clear removes only the | Redraw an opaque         
   after clear            | named application's    | background while the     
                          | elements.              | application is active.   
   Command hangs against  | The address or network | Check the USB/network    
   an unplugged bar       | connection is          | address and use a        
                          | unavailable.           | bounded command such     
                          |                        | as smoke or stream --    
                          |                        | duration-seconds.        
                                                                              
  ## See Also                                                                 
                                                                              
  • Getting Started with Busy Bar JavaScript /busybar-goja-getting-started.md 
  — build and run your first JavaScript application.                          
  • Busy Bar JavaScript API Reference /busybar-goja.md — complete             
  require("busybar") API reference.                                           
  • glaze help structured-output — Glazed output formats and field projection.
  • JavaScript lesson index /examples/busybar-js/README.md — progressive      
  lessons and assets.                                                         

```
