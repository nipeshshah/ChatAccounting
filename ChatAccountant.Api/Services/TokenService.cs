using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using ChatAccountant.Api.Models;
using Microsoft.IdentityModel.Tokens;

namespace ChatAccountant.Api.Services;

public interface ITokenService { string Create(AppUser user); }

public class TokenService(IConfiguration cfg) : ITokenService
{
    public string Create(AppUser user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(cfg["Jwt:Key"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email ?? "")
        };
        var days = cfg.GetValue("Jwt:ExpiryDays", 30);
        var token = new JwtSecurityToken(
            issuer: cfg["Jwt:Issuer"], audience: cfg["Jwt:Audience"], claims: claims,
            expires: DateTime.UtcNow.AddDays(days), signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
