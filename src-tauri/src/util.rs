fn env_var_ci(name: &str) -> Option<String> {
    if let Ok(v) = std::env::var(name) {
        return Some(v);
    }
    std::env::vars()
        .find(|(k, _)| k.eq_ignore_ascii_case(name))
        .map(|(_, v)| v)
}

fn expand_percent(input: &str) -> String {
    let mut result = String::new();
    let mut rest = input;
    loop {
        match rest.find('%') {
            Some(start) => {
                result.push_str(&rest[..start]);
                let after = &rest[start + 1..];
                if let Some(end) = after.find('%') {
                    let name = &after[..end];
                    result.push_str(&env_var_ci(name).unwrap_or_default());
                    rest = &after[end + 1..];
                } else {
                    result.push('%');
                    rest = after;
                }
            }
            None => {
                result.push_str(rest);
                break;
            }
        }
    }
    result
}

fn expand_braces(input: &str) -> String {
    let mut result = String::new();
    let mut rest = input;
    loop {
        match rest.find("${") {
            Some(start) => {
                result.push_str(&rest[..start]);
                let after = &rest[start + 2..];
                if let Some(end) = after.find('}') {
                    let name = &after[..end];
                    result.push_str(&env_var_ci(name).unwrap_or_default());
                    rest = &after[end + 1..];
                } else {
                    result.push_str("${");
                    rest = after;
                }
            }
            None => {
                result.push_str(rest);
                break;
            }
        }
    }
    result
}

pub fn expand_env(input: &str) -> String {
    if input.is_empty() {
        return String::new();
    }
    let mut s = expand_braces(input);
    s = expand_percent(&s);
    if let Some(stripped) = s.strip_prefix('~') {
        if let Some(home) = dirs::home_dir() {
            s = format!("{}{}", home.to_string_lossy(), stripped);
        }
    }
    s
}
