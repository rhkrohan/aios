# Glossary (plain English)

The restaurant analogy: your computer is a restaurant.

| Term | Plain meaning | Restaurant version |
| --- | --- | --- |
| Hardware | CPU, GPU, RAM, disk | Kitchen equipment |
| Kernel | Core of Linux; only thing that touches hardware | Head chef; everyone asks him |
| Process | A running program | One cook doing one job |
| Service / daemon | Background process that stays running | Dishwasher always on shift |
| systemd | Starts and supervises services | Manager who opens up and restarts staff |
| Boot | Starting the computer | Opening for the day |
| User space | Everything that is not the kernel | Everyone except the head chef |
| Permissions | Who may do what | Staff badges |
| IPC | Programs talking to each other | Order tickets |
| D-Bus | The desktop's message bus | The ticket rail everyone reads |
| Unix socket | Private local connection between two programs | A private note passed hand to hand |
| Wayland / compositor | Controls the screen and windows | Host controlling the dining room |
| AT-SPI / accessibility tree | Text description of every window and button | Written description of every table |
| Image-based OS / bootc | Whole OS shipped as one versioned image | Franchise kit shipped in a box |
| Containerfile | Recipe for building the image | Instructions for packing the box |
| Rollback | Boot the previous image | Send the new box back, use the old one |
| Btrfs snapshot | Instant copy of files to undo changes | Photo of the kitchen before changes |
| SELinux | Extra security rules on every process | Security guard checking badges |
| Flatpak | Sandboxed app packages | Food trucks parked outside, separate from the kitchen |
| Wine / Proton | Runs Windows apps on Linux | Translator for foreign chefs |
| Model / weights | The AI's learned brain, stored as a file | The waiter's brain |
| GGUF / quantization | Compressed model file format | Pocket-size edition of the brain |
| llama.cpp | Program that runs models locally | What lets the brain work in our kitchen |
| MCP | Standard way for AI to call tools | Standard order form |
| Tool | A typed action the AI can call | One item on the order form |
| Adapter | Code that connects a tool to an app | The runner who takes the order to the right station |
| Tunnel | All tools and adapters together | Service corridor behind the dining room |
| Broker | Approves actions, holds credentials | Manager who signs off risky orders |
| Reflex | Fast decider, never writes text | Host who glances and decides |
| Router | Picks local or cloud model | Deciding whether to call the expert chef |
| Vault | Local memory | Notebook of regulars |
| LoRA | Cheap fine-tuning add-on | Short training course for the waiter |
| Prompt injection | Text pretending to be instructions | A fake note slipped onto the ticket rail |
