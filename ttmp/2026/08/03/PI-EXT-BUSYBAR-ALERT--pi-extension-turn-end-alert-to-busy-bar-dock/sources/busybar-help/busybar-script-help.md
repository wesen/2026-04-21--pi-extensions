# busybar script --help

```text

  # script - Run a JavaScript Busy Bar application with go-go-goja            
                                                                              
  Run a CommonJS JavaScript file with require("busybar") available. Use --keep-
  alive for input-driven interactive applications so the runtime remains alive
  after the script starts its stream.                                         
                                                                              
  For more help, run: busybar help script                                     
                                                                              
  Run busybar help --ui to open the interactive help TUI.                     
                                                                              
  ## Usage:                                                                   
                                                                              
  busybar script [flags]                                                      
                                                                              
  ## Flags:                                                                   
                                                                              
                      --addr    Default BUSY Bar address exposed as           
  BUSYBAR_ADDR - <string> (default "10.0.4.20")                               
                  -h, --help    help for script                               
                     --input    JavaScript file to run - <string>             
                --keep-alive    Keep the runtime alive until interrupted -    
  <bool>                                                                      
                     --token    Optional API token exposed as BUSYBAR_TOKEN - 
  <string>                                                                    
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
                                                                              
  Use busybar script --help --long-help for information about all flags.      
                                                                              
  ## General topics                                                           
                                                                              
  Run busybar help <topic> to view a topic's page.                            
                                                                              
  • busybar-goja - Busy Bar JavaScript API Reference                          
                                                                              
  ## Applications                                                             
                                                                              
  Run busybar help <application> to view an application in full.              
                                                                              
  • busybar-animation-cli - Busy Bar CLI User Guide                           
                                                                              
  ## Tutorials                                                                
                                                                              
  Run busybar help <tutorial> to view a tutorial in full.                     
                                                                              
  • busybar-goja-getting-started - Getting Started with Busy Bar JavaScript   

```
