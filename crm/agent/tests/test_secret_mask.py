"""mask_secrets must never leave provider key material in the output."""

from secret_mask import CLIENT_ERROR_MESSAGE, mask_secrets


def test_masks_openrouter_and_openai_keys():
    shaped = "-".join(["sk", "or", "v1", "abcdefghijklmnopqrstuvwxyz012345"])
    raw = f"Incorrect API key provided: {shaped}"
    out = mask_secrets(raw)
    assert shaped not in out
    assert "[REDACTED]" in out


def test_masks_stripe_and_resend_keys():
    stripe_shaped = "_".join(["sk", "test", "xxFAKEKEYNOTFROMSTRIPE"])
    resend_shaped = "_".join(["re", "abcdefghijklmnopqrstuv"])
    raw = f"Invalid API Key provided: {stripe_shaped} plus {resend_shaped}"
    out = mask_secrets(raw)
    assert stripe_shaped not in out
    assert resend_shaped not in out


def test_masks_bearer_and_assignment():
    jwt_shaped = ".".join(["eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0", "e30", "notarealjwt"])
    openai_shaped = "-".join(["sk", "proj", "notarealkeyvalue"])
    raw = f"Authorization: Bearer {jwt_shaped} OPENAI_API_KEY={openai_shaped}"
    out = mask_secrets(raw)
    assert "notarealjwt" not in out
    assert openai_shaped not in out
    assert "OPENAI_API_KEY=" not in out


def test_client_error_has_no_interpolation_hole():
    assert "{" not in CLIENT_ERROR_MESSAGE
    assert "sk-" not in CLIENT_ERROR_MESSAGE
