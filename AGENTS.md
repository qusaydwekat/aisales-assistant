# Architecture rules

- Customer reply workers own a typing session from burst collection through final outbound delivery, with serialized refreshes and finally-based cleanup, so slow AI/tool calls cannot leave a gap or leak timers.