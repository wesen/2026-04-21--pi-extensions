# busybar stream --help

```text

  # stream - Print the Busy Bar input WebSocket stream                        
                                                                              
  Connects to /api/status/ws, enables the binary protobuf status stream, and  
  prints one structured row for every button, switch, or encoder event. The   
  device timestamp is in milliseconds; latency_ms is host receive time minus  
  that timestamp and is useful when the host and device clocks are            
  synchronized. Ctrl-C stops an open stream.                                  
                                                                              
  For more help, run: busybar help stream                                     
                                                                              
  Run busybar help --ui to open the interactive help TUI.                     
                                                                              
  ## Usage:                                                                   
                                                                              
  busybar stream [flags]                                                      
                                                                              
  ## Flags:                                                                   
                                                                              
                      --addr    Busy Bar address - <string> (default "10.0.4. 
  20")                                                                        
          --duration-seconds    Stop after this many seconds; 0 means until   
  Ctrl-C - <int>                                                              
                  -h, --help    help for stream                               
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
                                                                              
  Use busybar stream --help --long-help for information about all flags.      
                                                                              
  ## Applications                                                             
                                                                              
  Run busybar help <application> to view an application in full.              
                                                                              
  • busybar-animation-cli - Busy Bar CLI User Guide                           

```
