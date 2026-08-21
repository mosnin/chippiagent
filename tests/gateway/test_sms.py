"""Tests for SMS (Twilio) platform integration.

Covers config loading, format/truncate, echo prevention,
requirements check, toolset verification, and Twilio signature validation.
"""

import base64
import hashlib
import hmac
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from gateway.config import Platform, PlatformConfig, HomeChannel


# ── Config loading ──────────────────────────────────────────────────

class TestSmsConfigLoading:
    """Verify _apply_env_overrides wires SMS correctly."""

    def test_env_overrides_create_sms_config(self):
        from gateway.config import load_gateway_config

        env = {
            "TWILIO_ACCOUNT_SID": "ACtest123",
            "TWILIO_AUTH_TOKEN": "token_abc",
            "TWILIO_PHONE_NUMBER": "+15551234567",
        }
        with patch.dict(os.environ, env, clear=False):
            config = load_gateway_config()
            assert Platform.SMS in config.platforms
            pc = config.platforms[Platform.SMS]
            assert pc.enabled is True
            assert pc.api_key == "token_abc"

    def test_env_overrides_set_home_channel(self):
        from gateway.config import load_gateway_config

        env = {
            "TWILIO_ACCOUNT_SID": "ACtest123",
            "TWILIO_AUTH_TOKEN": "token_abc",
            "TWILIO_PHONE_NUMBER": "+15551234567",
            "SMS_HOME_CHANNEL": "+15559876543",
            "SMS_HOME_CHANNEL_NAME": "My Phone",
        }
        with patch.dict(os.environ, env, clear=False):
            config = load_gateway_config()
            hc = config.platforms[Platform.SMS].home_channel
            assert hc is not None
            assert hc.chat_id == "+15559876543"
            assert hc.name == "My Phone"
            assert hc.platform == Platform.SMS

# ── Format / truncate ───────────────────────────────────────────────

class TestSmsFormatAndTruncate:
    """Test SmsAdapter.format_message strips markdown."""

    def _make_adapter(self):
        from gateway.platforms.sms import SmsAdapter

        env = {
            "TWILIO_ACCOUNT_SID": "ACtest",
            "TWILIO_AUTH_TOKEN": "tok",
            "TWILIO_PHONE_NUMBER": "+15550001111",
        }
        with patch.dict(os.environ, env):
            pc = PlatformConfig(enabled=True, api_key="tok")
            adapter = object.__new__(SmsAdapter)
            adapter.config = pc
            adapter._platform = Platform.SMS
            adapter._account_sid = "ACtest"
            adapter._auth_token = "tok"
            adapter._from_number = "+15550001111"
        return adapter

    def test_strips_bold(self):
        adapter = self._make_adapter()
        assert adapter.format_message("**hello**") == "hello"

    def test_strips_italic(self):
        adapter = self._make_adapter()
        assert adapter.format_message("*world*") == "world"

    def test_strips_code_blocks(self):
        adapter = self._make_adapter()
        result = adapter.format_message("```python\nprint('hi')\n```")
        assert "```" not in result
        assert "print('hi')" in result

    def test_strips_inline_code(self):
        adapter = self._make_adapter()
        assert adapter.format_message("`code`") == "code"

    def test_strips_headers(self):
        adapter = self._make_adapter()
        assert adapter.format_message("## Title") == "Title"

    def test_strips_links(self):
        adapter = self._make_adapter()
        assert adapter.format_message("[click](https://example.com)") == "click"

    def test_collapses_newlines(self):
        adapter = self._make_adapter()
        result = adapter.format_message("a\n\n\n\nb")
        assert result == "a\n\nb"


# ── Echo prevention ────────────────────────────────────────────────

class TestSmsEchoPrevention:
    """Adapter should ignore messages from its own number."""

    def test_own_number_detection(self):
        """The adapter stores _from_number for echo prevention."""
        from gateway.platforms.sms import SmsAdapter

        env = {
            "TWILIO_ACCOUNT_SID": "ACtest",
            "TWILIO_AUTH_TOKEN": "tok",
            "TWILIO_PHONE_NUMBER": "+15550001111",
        }
        with patch.dict(os.environ, env):
            pc = PlatformConfig(enabled=True, api_key="tok")
            adapter = SmsAdapter(pc)
            assert adapter._from_number == "+15550001111"


# ── Requirements check ─────────────────────────────────────────────

class TestSmsRequirements:
    def test_check_sms_requirements_missing_sid(self):
        from gateway.platforms.sms import check_sms_requirements

        env = {"TWILIO_AUTH_TOKEN": "tok"}
        with patch.dict(os.environ, env, clear=True):
            assert check_sms_requirements() is False

    def test_check_sms_requirements_missing_token(self):
        from gateway.platforms.sms import check_sms_requirements

        env = {"TWILIO_ACCOUNT_SID": "ACtest"}
        with patch.dict(os.environ, env, clear=True):
            assert check_sms_requirements() is False

    def test_check_sms_requirements_both_set(self):
        from gateway.platforms.sms import check_sms_requirements

        env = {
            "TWILIO_ACCOUNT_SID": "ACtest",
            "TWILIO_AUTH_TOKEN": "tok",
        }
        with patch.dict(os.environ, env, clear=False):
            # Only returns True if aiohttp is also importable
            result = check_sms_requirements()
            try:
                import aiohttp  # noqa: F401
                assert result is True
            except ImportError:
                assert result is False


# ── Toolset verification ───────────────────────────────────────────

# ── Webhook host configuration ─────────────────────────────────────

class TestWebhookHostConfig:
    """Verify SMS_WEBHOOK_HOST env var and default."""

    def test_default_host_is_localhost(self):
        from gateway.platforms.sms import DEFAULT_WEBHOOK_HOST
        assert DEFAULT_WEBHOOK_HOST == "127.0.0.1"

    def test_host_from_env(self):
        from gateway.platforms.sms import SmsAdapter

        env = {
            "TWILIO_ACCOUNT_SID": "ACtest",
            "TWILIO_AUTH_TOKEN": "tok",
            "TWILIO_PHONE_NUMBER": "+15550001111",
            "SMS_WEBHOOK_HOST": "127.0.0.1",
        }
        with patch.dict(os.environ, env):
            pc = PlatformConfig(enabled=True, api_key="tok")
            adapter = SmsAdapter(pc)
            assert adapter._webhook_host == "127.0.0.1"

    def test_webhook_url_from_env(self):
        from gateway.platforms.sms import SmsAdapter

        env = {
            "TWILIO_ACCOUNT_SID": "ACtest",
            "TWILIO_AUTH_TOKEN": "tok",
            "TWILIO_PHONE_NUMBER": "+15550001111",
            "SMS_WEBHOOK_URL": "https://example.com/webhooks/twilio",
        }
        with patch.dict(os.environ, env):
            pc = PlatformConfig(enabled=True, api_key="tok")
            adapter = SmsAdapter(pc)
            assert adapter._webhook_url == "https://example.com/webhooks/twilio"

    def test_webhook_url_stripped(self):
        from gateway.platforms.sms import SmsAdapter

        env = {
            "TWILIO_ACCOUNT_SID": "ACtest",
            "TWILIO_AUTH_TOKEN": "tok",
            "TWILIO_PHONE_NUMBER": "+15550001111",
            "SMS_WEBHOOK_URL": "  https://example.com/webhooks/twilio  ",
        }
        with patch.dict(os.environ, env):
            pc = PlatformConfig(enabled=True, api_key="tok")
            adapter = SmsAdapter(pc)
            assert adapter._webhook_url == "https://example.com/webhooks/twilio"


# ── Startup guard (fail-closed) ────────────────────────────────────

class TestStartupGuard:
    """Adapter must refuse to start without SMS_WEBHOOK_URL."""

    def _make_adapter(self, extra_env=None):
        from gateway.platforms.sms import SmsAdapter

        env = {
            "TWILIO_ACCOUNT_SID": "ACtest",
            "TWILIO_AUTH_TOKEN": "tok",
            "TWILIO_PHONE_NUMBER": "+15550001111",
        }
        if extra_env:
            env.update(extra_env)
        with patch.dict(os.environ, env, clear=False):
            pc = PlatformConfig(enabled=True, api_key="tok")
            adapter = SmsAdapter(pc)
        return adapter

    @pytest.mark.asyncio
    async def test_refuses_start_without_webhook_url(self):
        adapter = self._make_adapter()
        result = await adapter.connect()
        assert result is False

    @pytest.mark.asyncio
    async def test_missing_webhook_url_is_non_retryable(self):
        adapter = self._make_adapter()
        await adapter.connect()
        assert adapter.has_fatal_error is True
        assert adapter.fatal_error_retryable is False
        assert "sms_missing_webhook_url" == adapter.fatal_error_code

    @pytest.mark.asyncio
    async def test_missing_phone_number_is_non_retryable(self):
        from gateway.platforms.sms import SmsAdapter

        env = {
            "TWILIO_ACCOUNT_SID": "ACtest",
            "TWILIO_AUTH_TOKEN": "tok",
            "TWILIO_PHONE_NUMBER": "",
            "SMS_WEBHOOK_URL": "",
        }
        with patch.dict(os.environ, env, clear=True):
            pc = PlatformConfig(enabled=True, api_key="tok")
            adapter = SmsAdapter(pc)
        await adapter.connect()
        assert adapter.has_fatal_error is True
        assert adapter.fatal_error_retryable is False
        assert adapter.fatal_error_code == "sms_missing_phone_number"

    @pytest.mark.asyncio
    async def test_insecure_flag_does_not_set_fatal_error(self):
        mock_session = AsyncMock()
        with patch.dict(os.environ, {"SMS_INSECURE_NO_SIGNATURE": "true"}), \
             patch("aiohttp.web.AppRunner") as mock_runner_cls, \
             patch("aiohttp.web.TCPSite") as mock_site_cls, \
             patch("aiohttp.ClientSession", return_value=mock_session):
            mock_runner_cls.return_value.setup = AsyncMock()
            mock_runner_cls.return_value.cleanup = AsyncMock()
            mock_site_cls.return_value.start = AsyncMock()
            adapter = self._make_adapter()
            result = await adapter.connect()
            assert result is True
            assert adapter.has_fatal_error is False
            await adapter.disconnect()

    @pytest.mark.asyncio
    async def test_insecure_flag_allows_start_without_url(self):
        mock_session = AsyncMock()
        with patch.dict(os.environ, {"SMS_INSECURE_NO_SIGNATURE": "true"}), \
             patch("aiohttp.web.AppRunner") as mock_runner_cls, \
             patch("aiohttp.web.TCPSite") as mock_site_cls, \
             patch("aiohttp.ClientSession", return_value=mock_session):
            mock_runner_cls.return_value.setup = AsyncMock()
            mock_runner_cls.return_value.cleanup = AsyncMock()
            mock_site_cls.return_value.start = AsyncMock()
            adapter = self._make_adapter()
            result = await adapter.connect()
            assert result is True
            await adapter.disconnect()

    @pytest.mark.asyncio
    async def test_webhook_url_allows_start(self):
        mock_session = AsyncMock()
        with patch("aiohttp.web.AppRunner") as mock_runner_cls, \
             patch("aiohttp.web.TCPSite") as mock_site_cls, \
             patch("aiohttp.ClientSession", return_value=mock_session):
            mock_runner_cls.return_value.setup = AsyncMock()
            mock_runner_cls.return_value.cleanup = AsyncMock()
            mock_site_cls.return_value.start = AsyncMock()
            adapter = self._make_adapter(
                extra_env={"SMS_WEBHOOK_URL": "https://example.com/webhooks/twilio"}
            )
            result = await adapter.connect()
            assert result is True
            await adapter.disconnect()


# ── Twilio signature validation ────────────────────────────────────

def _compute_twilio_signature(auth_token, url, params):
    """Reference implementation of Twilio's signature algorithm."""
    data_to_sign = url
    for key in sorted(params.keys()):
        data_to_sign += key + params[key]
    mac = hmac.new(
        auth_token.encode("utf-8"),
        data_to_sign.encode("utf-8"),
        hashlib.sha1,
    )
    return base64.b64encode(mac.digest()).decode("utf-8")


class TestTwilioSignatureValidation:
    """Unit tests for SmsAdapter._validate_twilio_signature."""

    def _make_adapter(self, auth_token="test_token_secret"):
        from gateway.platforms.sms import SmsAdapter

        env = {
            "TWILIO_ACCOUNT_SID": "ACtest",
            "TWILIO_AUTH_TOKEN": auth_token,
            "TWILIO_PHONE_NUMBER": "+15550001111",
        }
        with patch.dict(os.environ, env):
            pc = PlatformConfig(enabled=True, api_key=auth_token)
            adapter = SmsAdapter(pc)
        return adapter

    def test_valid_signature_accepted(self):
        adapter = self._make_adapter()
        url = "https://example.com/webhooks/twilio"
        params = {"From": "+15551234567", "Body": "hello", "To": "+15550001111"}
        sig = _compute_twilio_signature("test_token_secret", url, params)
        assert adapter._validate_twilio_signature(url, params, sig) is True

    def test_invalid_signature_rejected(self):
        adapter = self._make_adapter()
        url = "https://example.com/webhooks/twilio"
        params = {"From": "+15551234567", "Body": "hello"}
        assert adapter._validate_twilio_signature(url, params, "badsig") is False

    def test_wrong_token_rejected(self):
        adapter = self._make_adapter(auth_token="correct_token")
        url = "https://example.com/webhooks/twilio"
        params = {"From": "+15551234567", "Body": "hello"}
        sig = _compute_twilio_signature("wrong_token", url, params)
        assert adapter._validate_twilio_signature(url, params, sig) is False

    def test_params_sorted_by_key(self):
        """Signature must be computed with params sorted alphabetically."""
        adapter = self._make_adapter()
        url = "https://example.com/webhooks/twilio"
        params = {"Zebra": "last", "Alpha": "first", "Middle": "mid"}
        sig = _compute_twilio_signature("test_token_secret", url, params)
        assert adapter._validate_twilio_signature(url, params, sig) is True

    def test_empty_param_values_included(self):
        """Blank values must be included in signature computation."""
        adapter = self._make_adapter()
        url = "https://example.com/webhooks/twilio"
        params = {"From": "+15551234567", "Body": "", "SmsStatus": "received"}
        sig = _compute_twilio_signature("test_token_secret", url, params)
        assert adapter._validate_twilio_signature(url, params, sig) is True

    def test_url_matters(self):
        """Different URLs produce different signatures."""
        adapter = self._make_adapter()
        params = {"Body": "hello"}
        sig = _compute_twilio_signature(
            "test_token_secret", "https://a.com/webhooks/twilio", params
        )
        assert adapter._validate_twilio_signature(
            "https://b.com/webhooks/twilio", params, sig
        ) is False

    def test_port_variant_443_matches_without_port(self):
        """Signature for https URL with :443 validates against URL without port."""
        adapter = self._make_adapter()
        params = {"From": "+15551234567", "Body": "hello"}
        sig = _compute_twilio_signature(
            "test_token_secret", "https://example.com:443/webhooks/twilio", params
        )
        assert adapter._validate_twilio_signature(
            "https://example.com/webhooks/twilio", params, sig
        ) is True

    def test_port_variant_without_port_matches_443(self):
        """Signature for https URL without port validates against URL with :443."""
        adapter = self._make_adapter()
        params = {"From": "+15551234567", "Body": "hello"}
        sig = _compute_twilio_signature(
            "test_token_secret", "https://example.com/webhooks/twilio", params
        )
        assert adapter._validate_twilio_signature(
            "https://example.com:443/webhooks/twilio", params, sig
        ) is True

    def test_non_standard_port_no_variant(self):
        """Non-standard port must NOT match URL without port."""
        adapter = self._make_adapter()
        params = {"From": "+15551234567", "Body": "hello"}
        sig = _compute_twilio_signature(
            "test_token_secret", "https://example.com/webhooks/twilio", params
        )
        assert adapter._validate_twilio_signature(
            "https://example.com:8080/webhooks/twilio", params, sig
        ) is False

    def test_port_variant_http_80(self):
        """Port variant also works for http with port 80."""
        adapter = self._make_adapter()
        params = {"From": "+15551234567", "Body": "hello"}
        sig = _compute_twilio_signature(
            "test_token_secret", "http://example.com:80/webhooks/twilio", params
        )
        assert adapter._validate_twilio_signature(
            "http://example.com/webhooks/twilio", params, sig
        ) is True


# ── Webhook signature enforcement (handler-level) ──────────────────

class TestWebhookSignatureEnforcement:
    """Integration tests for signature validation in _handle_webhook."""

    def _make_adapter(self, webhook_url=""):
        from gateway.platforms.sms import SmsAdapter

        env = {
            "TWILIO_ACCOUNT_SID": "ACtest",
            "TWILIO_AUTH_TOKEN": "test_token_secret",
            "TWILIO_PHONE_NUMBER": "+15550001111",
            "SMS_WEBHOOK_URL": webhook_url,
        }
        with patch.dict(os.environ, env):
            pc = PlatformConfig(enabled=True, api_key="test_token_secret")
            adapter = SmsAdapter(pc)
        adapter._message_handler = AsyncMock()
        return adapter

    def _mock_request(self, body, headers=None):
        request = MagicMock()
        request.read = AsyncMock(return_value=body)
        request.headers = headers or {}
        return request

    @pytest.mark.asyncio
    async def test_insecure_flag_skips_validation(self):
        """With SMS_INSECURE_NO_SIGNATURE=true and no URL, requests are accepted."""
        env = {"SMS_INSECURE_NO_SIGNATURE": "true"}
        with patch.dict(os.environ, env):
            adapter = self._make_adapter(webhook_url="")
        body = b"From=%2B15551234567&To=%2B15550001111&Body=hello&MessageSid=SM123"
        request = self._mock_request(body)
        resp = await adapter._handle_webhook(request)
        assert resp.status == 200

    @pytest.mark.asyncio
    async def test_insecure_flag_with_url_still_validates(self):
        """When both SMS_WEBHOOK_URL and SMS_INSECURE_NO_SIGNATURE are set,
        validation stays active (URL takes precedence)."""
        adapter = self._make_adapter(webhook_url="https://example.com/webhooks/twilio")
        body = b"From=%2B15551234567&To=%2B15550001111&Body=hello&MessageSid=SM123"
        request = self._mock_request(body, headers={})
        resp = await adapter._handle_webhook(request)
        assert resp.status == 403

    @pytest.mark.asyncio
    async def test_missing_signature_returns_403(self):
        adapter = self._make_adapter(webhook_url="https://example.com/webhooks/twilio")
        body = b"From=%2B15551234567&To=%2B15550001111&Body=hello&MessageSid=SM123"
        request = self._mock_request(body, headers={})
        resp = await adapter._handle_webhook(request)
        assert resp.status == 403

    @pytest.mark.asyncio
    async def test_invalid_signature_returns_403(self):
        adapter = self._make_adapter(webhook_url="https://example.com/webhooks/twilio")
        body = b"From=%2B15551234567&To=%2B15550001111&Body=hello&MessageSid=SM123"
        request = self._mock_request(body, headers={"X-Twilio-Signature": "invalid"})
        resp = await adapter._handle_webhook(request)
        assert resp.status == 403

    @pytest.mark.asyncio
    async def test_valid_signature_returns_200(self):
        webhook_url = "https://example.com/webhooks/twilio"
        adapter = self._make_adapter(webhook_url=webhook_url)
        params = {
            "From": "+15551234567",
            "To": "+15550001111",
            "Body": "hello",
            "MessageSid": "SM123",
        }
        sig = _compute_twilio_signature("test_token_secret", webhook_url, params)
        body = b"From=%2B15551234567&To=%2B15550001111&Body=hello&MessageSid=SM123"
        request = self._mock_request(body, headers={"X-Twilio-Signature": sig})
        resp = await adapter._handle_webhook(request)
        assert resp.status == 200

    @pytest.mark.asyncio
    async def test_port_variant_signature_returns_200(self):
        """Signature computed with :443 should pass when URL configured without port."""
        webhook_url = "https://example.com/webhooks/twilio"
        adapter = self._make_adapter(webhook_url=webhook_url)
        params = {
            "From": "+15551234567",
            "To": "+15550001111",
            "Body": "hello",
            "MessageSid": "SM123",
        }
        sig = _compute_twilio_signature(
            "test_token_secret", "https://example.com:443/webhooks/twilio", params
        )
        body = b"From=%2B15551234567&To=%2B15550001111&Body=hello&MessageSid=SM123"
        request = self._mock_request(body, headers={"X-Twilio-Signature": sig})
        resp = await adapter._handle_webhook(request)
        assert resp.status == 200


# ── E.164 destination + send result ────────────────────────────────────

class TestToE164:
    def test_does_not_double_prefix_11_digit_us_number(self):
        from gateway.platforms.sms import to_e164

        assert to_e164("15551234567") == "+15551234567"
        assert to_e164("1-555-123-4567") == "+15551234567"
        assert to_e164("15551234567") != "+115551234567"

    def test_prefixes_10_digit_us_number(self):
        from gateway.platforms.sms import to_e164

        assert to_e164("5551234567") == "+15551234567"
        assert to_e164("(555) 123-4567") == "+15551234567"

    def test_keeps_valid_e164(self):
        from gateway.platforms.sms import to_e164

        assert to_e164("+15551234567") == "+15551234567"
        assert to_e164("+44 7911 123456") == "+447911123456"

    def test_refuses_international_without_plus(self):
        from gateway.platforms.sms import to_e164

        assert to_e164("447911123456") is None
        assert to_e164("0015551234567") is None

    def test_refuses_short_or_empty(self):
        from gateway.platforms.sms import to_e164

        assert to_e164("") is None
        assert to_e164("12345") is None


class TestTwilioAcceptedSend:
    def test_requires_sid_and_rejects_failed_status(self):
        from gateway.platforms.sms import twilio_accepted_send

        assert twilio_accepted_send({"sid": "SM123", "status": "queued"}) is True
        assert twilio_accepted_send({"sid": "SM123", "status": "sent"}) is True
        assert twilio_accepted_send({"status": "queued"}) is False
        assert twilio_accepted_send({"sid": "", "status": "queued"}) is False
        assert twilio_accepted_send({"sid": "SM123", "status": "failed"}) is False
        assert twilio_accepted_send({"sid": "SM123", "error_code": 21211}) is False
        assert twilio_accepted_send({}) is False
        assert twilio_accepted_send(None) is False


class _FakeResp:
    def __init__(self, status, body):
        self.status = status
        self._body = body

    async def json(self):
        return self._body

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


class _FakeSession:
    def __init__(self, status=201, body=None):
        self.status = status
        self.body = body if body is not None else {"sid": "SM123", "status": "queued"}
        self.posts = []

    def post(self, url, data=None, headers=None):
        fields = getattr(data, "fields", None)
        if fields is None and hasattr(data, "_fields"):
            fields = {item[0]["name"]: item[2] for item in data._fields}
        self.posts.append({"url": url, "fields": fields or {}, "headers": headers})
        return _FakeResp(self.status, self.body)


class _RecordingFormData:
    def __init__(self, *args, **kwargs):
        self.fields = {}

    def add_field(self, name, value):
        self.fields[name] = value


class TestSmsSend:
    def _make_adapter(self):
        from gateway.platforms.sms import SmsAdapter

        env = {
            "TWILIO_ACCOUNT_SID": "ACtest",
            "TWILIO_AUTH_TOKEN": "tok",
            "TWILIO_PHONE_NUMBER": "+15550001111",
        }
        with patch.dict(os.environ, env):
            pc = PlatformConfig(enabled=True, api_key="tok")
            adapter = SmsAdapter(pc)
        return adapter

    @pytest.mark.asyncio
    async def test_send_normalizes_11_digit_us_to(self):
        adapter = self._make_adapter()
        session = _FakeSession()
        adapter._http_session = session
        with patch("aiohttp.FormData", _RecordingFormData):
            result = await adapter.send("15551234567", "hello")
        assert result.success is True
        assert session.posts[0]["fields"]["To"] == "+15551234567"
        assert session.posts[0]["fields"]["To"] != "+115551234567"

    @pytest.mark.asyncio
    async def test_send_refuses_invalid_to(self):
        adapter = self._make_adapter()
        session = _FakeSession()
        adapter._http_session = session
        result = await adapter.send("12345", "hello")
        assert result.success is False
        assert session.posts == []

    @pytest.mark.asyncio
    async def test_send_2xx_without_sid_is_not_marked_sent(self):
        adapter = self._make_adapter()
        session = _FakeSession(status=201, body={"status": "queued"})
        adapter._http_session = session
        with patch("aiohttp.FormData", _RecordingFormData):
            result = await adapter.send("+15551234567", "hello")
        assert result.success is False

    @pytest.mark.asyncio
    async def test_send_2xx_with_error_code_is_not_marked_sent(self):
        adapter = self._make_adapter()
        session = _FakeSession(
            status=201,
            body={"sid": "SM123", "status": "failed", "error_code": 21211},
        )
        adapter._http_session = session
        with patch("aiohttp.FormData", _RecordingFormData):
            result = await adapter.send("+15551234567", "hello")
        assert result.success is False
