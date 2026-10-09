# brain-d

The SIOS brain (decisions D3, D4, D6, D14). It turns a request into a checked plan and runs it
through the broker (`../capd`), using the model as little as possible:

1. **Briefing:** file names, labels, people, off-limits places and every tool with its exact
   fields. No model call, never file contents.
2. **Plan:** a saved routine (no model call), or one model call that returns the whole plan.
3. **Check:** asks capd for the least pass the plan needs, dry-runs every step, and re-plans
   once if the broker would refuse something.
4. **Grant:** the owner approves the plan and its pass in the SIOS shell. brain-d can't grant
   its own pass.
5. **Run:** steps run without the model. Writing text from files is the only extra model call.
   Anything irreversible asks the owner again.
6. **Remember:** a plan that worked becomes a routine.

## Run

The SIOS preview starts it for you (Settings, Brain, Live machine). By hand:

    cargo build --release
    OPENAI_API_KEY=... ./target/release/brain-d serve
    ./target/release/brain-d brief "tidy my downloads"     # print the briefing

## Connect an outside AI (MCP)

Any MCP client can use SIOS. For Claude Desktop, add this to its config
(`~/Library/Application Support/Claude/claude_desktop_config.json`) and restart it, with the
live machine running:

    {
      "mcpServers": {
        "sios": { "command": "/Users/rohankhan/AIOS/brain-d/target/release/brain-d", "args": ["mcp"] }
      }
    }

It gets the `sios://briefing` resource and three tools: `sios_do` (hand SIOS a whole goal),
`sios_goal_status` and `sios_briefing`. Its goals appear in the SIOS shell for you to approve,
under its own name.
