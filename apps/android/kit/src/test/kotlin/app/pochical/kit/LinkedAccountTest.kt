package app.pochical.kit

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class LinkedAccountTest {
  @Test
  fun eachNonceIsNew() {
    val nonce = signInNonce()
    assertEquals(64, nonce.length)
    assertNotEquals(nonce, signInNonce())
  }
}
