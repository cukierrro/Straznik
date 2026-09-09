package pl.straznik.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class BackgroundPluginTest {
    @Test public void topicUsesTheSameAsciiSlugAsBackend() {
        assertEquals("voiv_warminsko-mazurskie", BackgroundPlugin.voivTopic("warmińsko-mazurskie"));
        assertEquals("voiv_lodzkie", BackgroundPlugin.voivTopic("łódzkie"));
    }
}
