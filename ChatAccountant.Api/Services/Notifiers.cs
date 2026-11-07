using ChatAccountant.Api.Models;

namespace ChatAccountant.Api.Services;

/// <summary>Sends the one-time code by SMS. Replace <see cref="LogOtpSender"/> with Twilio / MSG91 / etc. in production.</summary>
public interface IOtpSender { Task SendAsync(string phone, string code, CancellationToken ct); }

public class LogOtpSender(ILogger<LogOtpSender> log) : IOtpSender
{
    public Task SendAsync(string phone, string code, CancellationToken ct)
    {
        log.LogWarning("DEV OTP for {Phone}: {Code}  (no SMS provider configured - implement IOtpSender)", phone, code);
        return Task.CompletedTask;
    }
}

/// <summary>Optionally texts the recipient that a request is waiting. Return "sent" or "not-sent".</summary>
public interface IShareNotifier { Task<string> NotifyAsync(Share share, CancellationToken ct); }

public class NoopShareNotifier : IShareNotifier
{
    public Task<string> NotifyAsync(Share share, CancellationToken ct) => Task.FromResult("not-sent");
}
