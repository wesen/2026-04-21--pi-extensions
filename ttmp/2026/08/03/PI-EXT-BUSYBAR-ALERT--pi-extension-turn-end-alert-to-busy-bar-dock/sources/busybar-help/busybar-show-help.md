# busybar show --help

```text

  # show - Upload and display a compiled Busy Bar animation                   
                                                                              
  Uploads a compiled .anim file and then sends one animation element to the   
  Busy Bar HTTP API. Upload and draw are sequential, not atomic.              
                                                                              
  For more help, run: busybar help show                                       
                                                                              
  Run busybar help --ui to open the interactive help TUI.                     
                                                                              
  ## Usage:                                                                   
                                                                              
  busybar show [flags]                                                        
                                                                              
  ## Flags:                                                                   
                                                                              
                      --addr    Busy Bar address - <string> (default "10.0.4. 
  20")                                                                        
          --application-name    Application owner for uploaded asset and draw -
  <string> (default "busybar")                                                
        --await-previous-end    Finish a previous element with the same id    
  first - <bool>                                                              
                   --display    Display target: front or back - <string>      
  (default "front")                                                           
                  -h, --help    help for show                                 
                     --input    Compiled .anim path - <string>                
                      --loop    Loop the animation - <bool>                   
                  --priority    Draw priority from 1 to 100 - <int> (default  
  50)                                                                         
                   --section    Animation section - <string> (default         
  "default")                                                                  
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
                                                                              
  Use busybar show --help --long-help for information about all flags.        
                                                                              
  ## Applications                                                             
                                                                              
  Run busybar help <application> to view an application in full.              
                                                                              
  • busybar-animation-cli - Busy Bar CLI User Guide                           

```
