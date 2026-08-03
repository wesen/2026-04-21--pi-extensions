# busybar smoke --help

```text

  # smoke - Exercise text, image, rectangle, countdown, and animation display 
  elements                                                                    
                                                                              
  Runs a visible capability tour against one Busy Bar application. Each stage 
  draws one display element, waits for --step-seconds, and advances: text,    
  built-                                                                      
  in image, rectangle, countdown, then a compiled animation. The command      
  clears the application when it finishes.                                    
                                                                              
  For more help, run: busybar help smoke                                      
                                                                              
  Run busybar help --ui to open the interactive help TUI.                     
                                                                              
  ## Usage:                                                                   
                                                                              
  busybar smoke [flags]                                                       
                                                                              
  ## Flags:                                                                   
                                                                              
                      --addr    Busy Bar address - <string> (default "10.0.4. 
  20")                                                                        
                 --animation    Compiled .anim used by the final animation    
  stage - <string> (default "examples/busybar-js/assets/rainbow30.anim")      
          --application-name    Application owner for the smoke test -        
  <string> (default "busybar-smoke")                                          
                   --display    Display target: front or back - <string>      
  (default "front")                                                           
                  -h, --help    help for smoke                                
                 --led-color    Optional LED color in #RRGGBBAA format -      
  <string> (default "#00FF00FF")                                              
                  --priority    Draw priority from 1 to 100 - <int> (default  
  100)                                                                        
              --step-seconds    Seconds to show each capability - <int>       
  (default 3)                                                                 
                     --token    Optional X-API-Token value - <string>         
                 --long-help    Show long help                                
                                                                              
  ## Structured output:                                                       
                                                                              
                    --format    Structured output format - <choice> (table,   
  json,jsonl,csv,tsv,yaml) (default "table")                                  
           --max-output-rows    Maximum number of rows to serialize (0 means  
  unlimited) - <int>                                                          
             --output-fields    Fields to include in output (requested order  
  is preserved by tabular formats) - <stringList>                             
                                                                              
  ## General purpose command options:                                         
                                                                              
               --config-file    Explicit config file path to load via         
  middlewares - <string>                                                      
       --print-parsed-fields    Print the parsed fields - <bool>              
              --print-schema    Print the command's schema - <bool>           
                --print-yaml    Print the command's YAML - <bool>             
                                                                              
  ## Global flags:                                                            
                                                                              
                  --log-area    Per-area log level override, for example app. 
  view:debug or app.db=warn                                                   
                --log-config    Additional logcopter profile/config file;     
  repeatable                                                                  
                  --log-file    Log file (default: stderr)                    
                --log-format    Log format (json, text) (default "text")      
                 --log-level    Log level (trace, debug, info, warn, error,   
  fatal) (default "info")                                                     
             --log-to-stdout    Log to stdout even when log-file is set       
          --strict-log-areas    Fail when configured log areas do not match   
  known generated logcopter areas                                             
               --with-caller    Log caller information                        
                                                                              
  Use busybar smoke --help --long-help for information about all flags.       
                                                                              
  ## Applications                                                             
                                                                              
  Run busybar help <application> to view an application in full.              
                                                                              
  • busybar-animation-cli - Busy Bar CLI User Guide                           

```
