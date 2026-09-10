package com.argus.localcore

import org.junit.Assert.*
import org.junit.Test

class CommandLaunchQueueTest {
    private fun queue(): CommandLaunchQueue {
        var sequence = 0
        return CommandLaunchQueue { "command-${++sequence}" }
    }

    @Test fun onlyTheExactCommandActionCreatesALaunch() {
        val queue = queue()
        for (action in listOf(null, "android.intent.action.MAIN", "android.intent.action.SEND",
            "open_command", "${CommandLaunchQueue.ACTION}?text=remember", " ${CommandLaunchQueue.ACTION}")) {
            queue.initialize(action, false, null)
            assertNull(queue.peek())
        }
        queue.initialize(CommandLaunchQueue.ACTION, false, null)
        assertEquals("command-1", queue.peek())
    }

    @Test fun aColdStartWaitsUntilTheWebAppCanConsumeItOnce() {
        val queue = queue()
        queue.initialize(CommandLaunchQueue.ACTION, false, null)
        assertEquals("command-1", queue.peek())
        assertEquals("command-1", queue.peek())
        assertFalse(queue.consume(""))
        assertTrue(queue.consume("command-1"))
        assertFalse(queue.consume("command-1"))
        assertNull(queue.peek())
    }

    @Test fun aNewTapSupersedesAnyOlderPendingTap() {
        val queue = queue()
        queue.accept(CommandLaunchQueue.ACTION)
        val old = queue.peek()!!
        queue.accept(CommandLaunchQueue.ACTION)
        assertFalse(queue.consume(old))
        assertEquals("command-2", queue.peek())
        assertTrue(queue.consume("command-2"))
    }

    @Test fun aShareReminderOrNormalLaunchSupersedesCommand() {
        val queue = queue()
        for (action in listOf("android.intent.action.SEND", "android.intent.action.MAIN", null)) {
            queue.accept(CommandLaunchQueue.ACTION)
            val id = queue.peek()!!
            queue.accept(action)
            assertNull(queue.peek())
            assertFalse(queue.consume(id))
        }
    }

    @Test fun recreationRestoresAnUnconsumedTapWithTheSameToken() {
        val original = queue()
        original.accept(CommandLaunchQueue.ACTION)
        val recreated = queue()
        recreated.initialize(CommandLaunchQueue.ACTION, true, original.peek())
        assertEquals(original.peek(), recreated.peek())
        assertTrue(recreated.consume(original.peek()!!))
    }

    @Test fun recreationDoesNotReplayTheOriginalConsumedIntent() {
        val original = queue()
        original.accept(CommandLaunchQueue.ACTION)
        original.consume(original.peek()!!)
        val recreated = queue()
        recreated.initialize(CommandLaunchQueue.ACTION, true, original.peek())
        assertNull(recreated.peek())
    }

    @Test fun invalidSavedStateCannotBecomeALaunch() {
        val queue = queue()
        for (saved in listOf("", "remember this", "command-", "command-${"x".repeat(81)}")) {
            queue.initialize(CommandLaunchQueue.ACTION, true, saved)
            assertNull(queue.peek())
        }
    }
}
