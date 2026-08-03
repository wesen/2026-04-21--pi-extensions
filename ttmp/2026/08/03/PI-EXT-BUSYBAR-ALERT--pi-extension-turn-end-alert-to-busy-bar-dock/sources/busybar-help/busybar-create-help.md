# busybar create --help

```text

  # create - Create a Busy Bar animation source zip and optional .anim asset  
                                                                              
  Create deterministic animation frames from a built-in pattern or numbered   
  PNG                                                                         
  files. The optional compile output is directly uploadable to the Busy Bar.  
                                                                              
  For more help, run: busybar help create                                     
                                                                              
  Run busybar help --ui to open the interactive help TUI.                     
                                                                              
  ## Usage:                                                                   
                                                                              
  busybar create [flags]                                                      
                                                                              
  ## Flags:                                                                   
                                                                              
            --compile-output    Optional compiled .anim output path - <string>
                   --display    Target display: front or back - <string>      
  (default "front")                                                           
                       --fps    Frames per second - <int> (default 12)        
                    --frames    Number of generated frames - <int> (default   
  12)                                                                         
                --frames-dir    Directory containing frame_0.png, frame_1.png, ... -
  <string>                                                                    
                    --height    Pattern height (0 uses the display height) -  
  <int>                                                                       
                  -h, --help    help for create                               
                      --name    Animation name used in metadata - <string>    
                    --output    Source zip output path - <string> (default    
  "animation.zip")                                                            
                   --pattern    Built-in pattern: spinner or pulse - <string> 
  (default "spinner")                                                         
                     --width    Pattern width (0 uses the display width) -    
  <int>                                                                       
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
                                                                              
  Use busybar create --help --long-help for information about all flags.      
                                                                              
  ## Applications                                                             
                                                                              
  Run busybar help <application> to view an application in full.              
                                                                              
  • busybar-animation-cli - Busy Bar CLI User Guide                           

```
